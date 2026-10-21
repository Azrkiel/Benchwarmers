// Pure fuzzy matching for voice MCP tools. No store, no I/O: callers pass data in.
import type { Crew, Game, Household, Player, Position, Prop, PropOption, Sport, Team } from '../shared/types.js';
import { projectionOf } from '../game/projections.js';

export type MatchOk<T> = { ok: true; value: T };
export type MatchErr = { ok: false; code: 'NOT_FOUND' | 'AMBIGUOUS'; message: string; options?: string[] };
export type MatchResult<T> = MatchOk<T> | MatchErr;

// ---------- basics ----------

/** Lowercase, strip diacritics, drop apostrophes, other punctuation -> space, collapse, trim. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const FILLER = new Set([
  'the', 'a', 'an', 'crew', 'party', 'with', 'from', 'in', 'household', 'house', 'folks', 'gang',
  'family', 'watch', 'please', 'my', 'our', 'team', 'player', 's',
]);

const toks = (s: string): string[] => normalize(s).split(' ').filter(Boolean);

/** Drop filler words; if that would leave nothing, keep the original tokens. */
function stripFiller(t: string[], extra?: Set<string>): string[] {
  const out = t.filter((x) => !FILLER.has(x) && !(extra && extra.has(x)));
  return out.length ? out : t;
}

function orList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

const ok = <T>(value: T): MatchOk<T> => ({ ok: true, value });
const notFound = (message: string, options?: string[]): MatchErr => ({ ok: false, code: 'NOT_FOUND', message, ...(options ? { options } : {}) });
const ambiguous = (message: string, options?: string[]): MatchErr => ({ ok: false, code: 'AMBIGUOUS', message, ...(options ? { options } : {}) });

// ---------- scoring ----------

function variants(t: string): string[] {
  const v = [t];
  if (t.length > 2 && t.endsWith('s')) v.push(t.slice(0, -1));
  if (t.length > 3 && t.endsWith('es')) v.push(t.slice(0, -2));
  return v;
}

/** Equal after dropping a plural / possessive "s" on either side. */
function tokEq(a: string, b: string): boolean {
  if (a === b) return true;
  const vb = variants(b);
  return variants(a).some((x) => vb.includes(x));
}

const tolFor = (a: string, b: string): number => (Math.max(a.length, b.length) <= 5 ? 1 : 2);
const hasDigit = (s: string): boolean => /\d/.test(s);

type ScoreOpts = {
  /** Targets with this many characters or fewer only match exactly (no fuzzy). */
  noFuzzyAtOrBelow?: number;
};

/** 3 exact, 2 prefix, 1 fuzzy, 0 none. */
function tokenTier(inTok: string, tgt: string, opts: ScoreOpts): number {
  if (tokEq(inTok, tgt)) return 3;
  if (inTok.length >= 3 && tgt.startsWith(inTok)) return 2;
  if (hasDigit(inTok) || hasDigit(tgt)) return 0;
  if (opts.noFuzzyAtOrBelow !== undefined && tgt.length <= opts.noFuzzyAtOrBelow) return 0;
  if (Math.min(inTok.length, tgt.length) < 2 || Math.max(inTok.length, tgt.length) < 3) return 0;
  return editDistance(inTok, tgt) <= tolFor(inTok, tgt) ? 1 : 0;
}

/** Score an input token list against one target token list. 0 = no match, up to 100 = exact. */
function phraseScore(inToks: string[], tgtToks: string[], opts: ScoreOpts): number {
  if (!inToks.length || !tgtToks.length) return 0;
  let minTier = 3;
  let dist = 0;
  for (const it of inToks) {
    let best = 0;
    let bestDist = 99;
    for (const tt of tgtToks) {
      const tier = tokenTier(it, tt, opts);
      if (tier > best || (tier === best && tier === 1 && editDistance(it, tt) < bestDist)) {
        best = tier;
        bestDist = tier === 1 ? editDistance(it, tt) : 0;
      }
    }
    if (best === 0) return joinedFuzzy(inToks, tgtToks, opts);
    minTier = Math.min(minTier, best);
    if (best === 1) dist += bestDist;
  }
  const base = minTier === 3 ? 80 : minTier === 2 ? 60 : 40;
  if (minTier === 3 && inToks.length === tgtToks.length) return 100;
  return base + Math.min(inToks.length / tgtToks.length, 1) * 5 - dist * 0.5;
}

/** "bigmo" vs "big mo": compare with spaces removed. */
function joinedFuzzy(inToks: string[], tgtToks: string[], opts: ScoreOpts): number {
  const a = inToks.join('');
  const b = tgtToks.join('');
  if (hasDigit(a) || hasDigit(b) || Math.min(a.length, b.length) < 3) return 0;
  if (opts.noFuzzyAtOrBelow !== undefined && b.length <= opts.noFuzzyAtOrBelow) return 0;
  const d = editDistance(a, b);
  return d <= tolFor(a, b) ? 40 - d * 0.5 : 0;
}

type Cand<T> = { item: T; names: string[] };

/** Best-scoring distinct items. Empty when nothing matches. */
function rank<T>(inToks: string[], cands: Cand<T>[], opts: ScoreOpts = {}): T[] {
  let top = 0;
  let winners: T[] = [];
  for (const c of cands) {
    let s = 0;
    for (const n of c.names) s = Math.max(s, phraseScore(inToks, stripFiller(toks(n)), opts));
    if (s <= 0) continue;
    if (s > top + 1e-9) {
      top = s;
      winners = [c.item];
    } else if (Math.abs(s - top) <= 1e-9) winners.push(c.item);
  }
  return winners;
}

// ---------- crews / households ----------

export function matchCrew(input: string, crews: Crew[], households: Household[]): MatchResult<Crew> {
  const t = stripFiller(toks(input));
  const hById = new Map(households.map((h) => [h.id, h]));
  const cands: Cand<Crew>[] = crews.map((c) => {
    const names = [c.name, c.id];
    for (const hid of c.householdIds) {
      const h = hById.get(hid);
      if (h) names.push(h.name, h.city, h.id);
    }
    return { item: c, names };
  });
  const winners = t.length ? rank(t, cands) : [];
  if (winners.length === 1) return ok(winners[0]);
  const names = crews.map((c) => c.name);
  if (winners.length > 1) return ambiguous(`That could be ${orList(winners.map((c) => c.name))}. Which crew?`, winners.map((c) => c.name));
  if (crews.length === 1 && !normalize(input).replace(/\b(the|crew|party|my|our)\b/g, '').trim()) return ok(crews[0]);
  return notFound(`I couldn't find a crew called ${input.trim()}. Your crews are: ${names.join(', ')}.`, names);
}

export function matchHousehold(input: string, households: Household[]): MatchResult<Household> {
  const t = stripFiller(toks(input));
  const cands: Cand<Household>[] = households.map((h) => ({ item: h, names: [h.name, h.city, h.id] }));
  const winners = t.length ? rank(t, cands) : [];
  if (winners.length === 1) return ok(winners[0]);
  if (winners.length > 1) return ambiguous(`That could be ${orList(winners.map((h) => h.name))}. Which household?`, winners.map((h) => h.name));
  const names = households.map((h) => h.name);
  return notFound(`I couldn't find a household called ${input.trim()}. The households are: ${names.join(', ')}.`, names);
}

// ---------- members ----------

export type MemberCandidate = { memberId: string; name: string; household: string; householdId: string };

const HINT_MARKERS = new Set(['from', 'at', 'in', 'with']);

export function matchMember(input: string, members: MemberCandidate[]): MatchResult<MemberCandidate> {
  const all = toks(input);
  const mi = all.findIndex((w, i) => i > 0 && HINT_MARKERS.has(w) && i < all.length - 1);
  const nameToks = stripFiller(mi > 0 ? all.slice(0, mi) : all);
  const hintToks = mi > 0 ? stripFiller(all.slice(mi + 1)) : [];

  let pool = members;
  if (hintToks.length) {
    const byH = new Map<string, MemberCandidate>();
    for (const m of members) if (!byH.has(m.householdId)) byH.set(m.householdId, m);
    const hs = rank(
      hintToks,
      [...byH.values()].map((m) => ({ item: m.householdId, names: [m.household, m.householdId] })),
    );
    if (hs.length) {
      const filtered = members.filter((m) => hs.includes(m.householdId));
      if (filtered.length) pool = filtered;
    }
  }

  const cands: Cand<MemberCandidate>[] = pool.map((m) => ({ item: m, names: [m.name, m.memberId] }));
  let winners = nameToks.length ? rank(nameToks, cands, { noFuzzyAtOrBelow: 3 }) : [];
  if (pool !== members && !winners.length) {
    winners = rank(nameToks, members.map((m) => ({ item: m, names: [m.name, m.memberId] })), { noFuzzyAtOrBelow: 3 });
  }
  if (winners.length === 1) return ok(winners[0]);
  if (winners.length > 1) {
    const sameName = winners.every((w) => normalize(w.name) === normalize(winners[0].name));
    const households = uniq(winners.map((w) => w.household));
    if (sameName && households.length > 1) {
      return ambiguous(`There's more than one ${winners[0].name} here. Which household are you in: ${orList(households)}?`, households);
    }
    const names = uniq(winners.map((w) => w.name));
    return ambiguous(`Did you mean ${orList(names)}?`, names);
  }
  const names = uniq(members.map((m) => m.name));
  return notFound(`I don't know anyone called ${input.trim()} in this party. Players tonight: ${names.join(', ')}.`, names);
}

// ---------- players ----------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Parse "7", "seven", "thirty four" (already tokenised). Null when not a number. */
function parseNumber(t: string[]): number | null {
  if (t.length === 1) {
    if (/^\d{1,2}$/.test(t[0])) return parseInt(t[0], 10);
    const o = ONES.indexOf(t[0]);
    if (o >= 0) return o;
    return t[0] in TENS ? TENS[t[0]] : null;
  }
  if (t.length === 2 && t[0] in TENS) {
    const o = ONES.indexOf(t[1]);
    if (o >= 1 && o <= 9) return TENS[t[0]] + o;
  }
  return null;
}

function teamWords(team: Team): string[] {
  return uniq([...toks(team.name), ...toks(team.short), ...toks(team.id)]);
}

/** Split tokens into the team they name (if exactly one team) and the rest. */
function extractTeam(t: string[], game: Game): { team?: Team; rest: string[] } {
  const teams = [game.home, game.away];
  const words = teams.map(teamWords);
  const hit = new Set<number>();
  const rest: string[] = [];
  for (const w of t) {
    const idx = words.findIndex((ws) => ws.some((x) => tokEq(w, x)));
    if (idx >= 0) hit.add(idx);
    else rest.push(w);
  }
  if (hit.size === 1) return { team: teams[[...hit][0]], rest };
  return { rest: t };
}

const POSITION_WORDS: Record<string, Position> = {
  'point guard': 'PG', pg: 'PG', 'p g': 'PG', point: 'PG',
  'shooting guard': 'SG', sg: 'SG', 's g': 'SG', shooting: 'SG',
  'small forward': 'SF', sf: 'SF', 's f': 'SF', small: 'SF',
  'power forward': 'PF', pf: 'PF', 'p f': 'PF', power: 'PF',
  center: 'C', centre: 'C', c: 'C', 'big man': 'C', bigman: 'C',
  // Football (phase 8). "back" and "k" are safe here: no basketball word uses them.
  quarterback: 'QB', qb: 'QB', 'q b': 'QB',
  'running back': 'RB', rb: 'RB', 'r b': 'RB', back: 'RB', halfback: 'RB', tailback: 'RB',
  'wide receiver': 'WR', receiver: 'WR', wr: 'WR', 'w r': 'WR', wideout: 'WR',
  'tight end': 'TE', te: 'TE', 't e': 'TE',
  kicker: 'K', placekicker: 'K', k: 'K',
};

function parsePosition(t: string[]): Position | null {
  if (!t.length) return null;
  const phrase = t.join(' ');
  for (const p of [phrase, phrase.replace(/s$/, ''), phrase.replace(/men$/, 'man')]) {
    if (p in POSITION_WORDS) return POSITION_WORDS[p];
  }
  if (phrase.length >= 5 && !hasDigit(phrase)) {
    const hits = new Set<Position>();
    for (const [k, v] of Object.entries(POSITION_WORDS)) {
      if (k.length >= 5 && editDistance(phrase, k) <= tolFor(phrase, k)) hits.add(v);
    }
    if (hits.size === 1) return [...hits][0];
  }
  return null;
}

const NUMBER_FILLER = new Set(['number', 'no', 'num', 'jersey', 'numero', 'wearing', 'number', 'is']);

export function matchPlayer(input: string, game: Game, opts?: { takenIds?: Iterable<string> }): MatchResult<Player> {
  const players = [...game.home.roster, ...game.away.roster];
  const teamName = (p: Player): string => (p.teamId === game.home.id ? game.home.name : game.away.name);
  const taken = new Set(opts?.takenIds ?? []);
  const rawToks = toks(input);
  const fail = (): MatchErr =>
    notFound(
      `I couldn't find a player called ${input.trim()}. Try a name, a nickname like Big Mo, a jersey number, or something like Harbor's point guard.`,
    );
  const askWhich = (list: Player[], lead: string): MatchErr =>
    ambiguous(`${lead} ${orList(list.map((p) => `${p.name} (${teamName(p)})`))}. Which one?`, list.map((p) => p.name));

  // 1. exact name / last / first / nickname / id
  {
    const n = normalize(input);
    const ns = stripFiller(rawToks).join(' ');
    const hits = players.filter((p) => {
      const parts = toks(p.name);
      const names = [p.name, parts[parts.length - 1] ?? '', parts[0] ?? '', p.nickname ?? '', p.id].map(normalize).filter(Boolean);
      return names.some((x) => x === n || stripFiller(x.split(' ')).join(' ') === ns);
    });
    if (hits.length === 1) return ok(hits[0]);
    if (hits.length > 1) return askWhich(hits, 'More than one player fits:');
  }

  const { team, rest } = extractTeam(rawToks, game);

  // 2. jersey number (+ optional team)
  {
    const numToks = rest.filter((w) => !FILLER.has(w) && !NUMBER_FILLER.has(w));
    const n = parseNumber(numToks);
    if (n !== null) {
      const hits = players.filter((p) => p.number === n && (!team || p.teamId === team.id));
      if (hits.length === 1) return ok(hits[0]);
      if (hits.length > 1) return askWhich(hits, `More than one player wears number ${n}:`);
      return fail();
    }
  }

  // 3. position (+ optional team)
  {
    const pos = parsePosition(rest.filter((w) => !FILLER.has(w) && w !== 'number'));
    if (pos) {
      const pool = players.filter((p) => p.position === pos && (!team || p.teamId === team.id));
      if (!pool.length) return fail();
      const sorted = [...pool].sort((a, b) => projectionOf(b.id) - projectionOf(a.id));
      return ok(sorted.find((p) => !taken.has(p.id)) ?? sorted[0]);
    }
  }

  // 4. fuzzy over names, last names, first names and nicknames
  {
    const t = stripFiller(rawToks.filter((w) => w !== 'number'));
    const cands: Cand<Player>[] = players.map((p) => {
      const parts = toks(p.name);
      return { item: p, names: [p.name, parts[parts.length - 1] ?? '', parts[0] ?? '', ...(p.nickname ? [p.nickname, `${p.nickname} ${parts[parts.length - 1] ?? ''}`] : [])] };
    });
    const winners = rank(t, cands);
    if (winners.length === 1) return ok(winners[0]);
    if (winners.length > 1) return askWhich(winners, 'More than one player fits:');
  }
  return fail();
}

// ---------- prop options ----------

function propSynonyms(prop: Prop, game: Game): Record<string, string[]> {
  switch (prop.resolver.kind) {
    case 'teamScoresFirst':
      return {
        home: ['home', game.home.name, game.home.short, game.home.id, ...toks(game.home.name)],
        away: ['away', game.away.name, game.away.short, game.away.id, ...toks(game.away.name)],
        none: ['nobody', 'no one', 'neither', 'none'],
      };
    case 'nextScoreType':
      return {
        three: ['three', 'a three', 'three pointer', 'three-pointer', '3', 'trey', 'from downtown'],
        two: ['two', 'two pointer', '2', 'layup', 'dunk', 'jumper', 'bucket'],
        ft: ['free throw', 'foul shot', 'free throws', 'ft', 'from the line', 'one'],
        other: ['other', 'anything else', 'something else', 'not a three', 'no'],
      };
    case 'totalPointsOver':
      return {
        over: ['over', 'the over', 'more', 'higher', 'yes'],
        under: ['under', 'the under', 'less', 'fewer', 'lower', 'no'],
      };
    case 'driveResult':
      return {
        // "score" alone means yes; "no score" must beat it (exact phrase tier), so both stay in their own lists.
        yes: ['yes', 'yeah', 'they score', 'score', 'touchdown', 'td', 'points'],
        no: ['no', 'nope', 'stopped', 'stop', 'punt', 'no score', 'no touchdown', 'they get stopped', 'get stopped', 'held'],
      };
  }
}

export function matchPropOption(input: string, prop: Prop, game: Game): MatchResult<PropOption> {
  const syn = propSynonyms(prop, game);
  const cands: Cand<PropOption>[] = prop.options.map((o) => ({ item: o, names: [o.id, o.label, ...(syn[o.id] ?? [])] }));
  const t = stripFiller(toks(input));
  const winners = t.length ? rank(t, cands) : [];
  if (winners.length === 1) return ok(winners[0]);
  const labels = prop.options.map((o) => o.label);
  if (winners.length > 1) return ambiguous(`That could be ${orList(winners.map((o) => o.label))}. Which one?`, winners.map((o) => o.label));
  return notFound(`That's not one of the choices. You can pick ${orList(labels)}.`, labels);
}

// ---------- games ----------

// "tonight's game" normalises to "tonights game": the possessive forms must filler out too.
const GAME_FILLER = new Set(['vs', 'versus', 'v', 'game', 'match', 'tonight', 'tonights', 'today', 'todays', 'the']);

export function matchGame(input: string | undefined, games: Game[]): MatchResult<Game> {
  const raw = (input ?? '').trim();
  if (!raw) {
    return games.length ? ok(games[0]) : notFound('There are no games available right now.', []);
  }
  const t = toks(raw).filter((w) => !GAME_FILLER.has(w) && !FILLER.has(w));
  if (!t.length && games.length) return ok(games[0]); // "tonight's game" -> the default (first) game
  let top = 0;
  let winners: Game[] = [];
  for (const g of games) {
    const sportWords = g.sport === 'football' ? ['football', 'gridiron', 'nfl'] : ['basketball', 'hoops'];
    const bag = uniq([...toks(g.title), ...toks(g.id), ...teamWords(g.home), ...teamWords(g.away), ...sportWords]);
    let s = 0;
    for (const w of t) if (bag.some((b) => tokenTier(w, b, {}) > 0)) s++;
    if (s === 0) continue;
    if (s > top) {
      top = s;
      winners = [g];
    } else if (s === top) winners.push(g);
  }
  if (winners.length === 1) return ok(winners[0]);
  if (winners.length > 1) return ambiguous(`That could be ${orList(winners.map((g) => g.title))}. Which game?`, winners.map((g) => g.title));
  if (games.length === 1) return ok(games[0]);
  const titles = games.map((g) => g.title);
  return notFound(`I couldn't find a game called ${raw}. The games are: ${titles.join(', ')}.`, titles);
}

// ---------- teams / positions (list filters) ----------

/** Which side a spoken team name means: "Harbor", "Hawks", "Foxes", "SUM", "home", "away". */
export function matchTeam(input: string, game: Game): MatchResult<'home' | 'away'> {
  const t = toks(input).filter((w) => !FILLER.has(w) || w === 's');
  const words = toks(input);
  if (words.length === 1 && (words[0] === 'home' || words[0] === 'away')) return ok(words[0]);
  const { team } = extractTeam(t.length ? t : words, game);
  if (team) return ok(team.id === game.home.id ? 'home' : 'away');
  const names = [game.home.name, game.away.name];
  return notFound(`I couldn't find a team called ${input.trim()}. The teams are ${orList(names)}.`, names);
}

const BASKETBALL_POSITION_EXAMPLES = ['point guard', 'shooting guard', 'small forward', 'power forward', 'center'];
const FOOTBALL_POSITION_EXAMPLES = ['quarterback', 'running back', 'wide receiver', 'tight end', 'kicker'];

/**
 * A spoken position ("point guard", "C", "centers", "quarterback", "QB") to a Position code.
 * `sport` only picks the examples in the not-found reply; with no sport the examples cover both games.
 */
export function matchPosition(input: string, sport?: Sport): MatchResult<Position> {
  const t = toks(input).filter((w) => w !== 'the' && w !== 'a' && w !== 'an' && w !== 'player' && w !== 'players');
  const pos = parsePosition(t);
  if (pos) return ok(pos);
  const options =
    sport === 'football'
      ? FOOTBALL_POSITION_EXAMPLES
      : sport === 'basketball'
        ? BASKETBALL_POSITION_EXAMPLES
        : ['point guard', 'center', 'quarterback', 'running back', 'wide receiver', 'tight end', 'kicker'];
  return notFound(`I don't know the position ${input.trim()}. Try ${orList(options)}.`, options);
}
