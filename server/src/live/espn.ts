// Small client for ESPN's public (unofficial, keyless) JSON. Used only by the runtime "pull up a real game" importer;
// committed demo data stays fictional. Everything takes an injectable fetch so tests never touch the network.

export type League = 'college-football' | 'nfl';
export const LEAGUES: readonly League[] = ['college-football', 'nfl'];

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type EspnErrorKind = 'bad_request' | 'not_found' | 'upstream';

/** `not_found` -> 404 with a readable message; `upstream` -> 502 (ESPN down, slow or changed). */
export class EspnError extends Error {
  constructor(
    readonly kind: EspnErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'EspnError';
  }
}

export type EspnDeps = { fetch?: FetchLike; timeoutMs?: number; now?: () => Date };

export type ResolvedGame = {
  eventId: string;
  league: League;
  title: string;
  date: string;
  status: string;
  completed: boolean;
  /** Set when resolving an event id / URL already required the full summary; the importer reuses it. */
  summary?: unknown;
};

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football';
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------- fetching ----------

export async function espnJson(url: string, deps: EspnDeps = {}): Promise<unknown> {
  const doFetch: FetchLike = deps.fetch ?? ((u, init) => fetch(u, init));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: ctl.signal });
    if (res.status === 404 || res.status === 400) throw new EspnError('not_found', 'ESPN has no data for that.');
    if (!res.ok) throw new EspnError('upstream', `ESPN answered with HTTP ${res.status}. Try again in a minute.`);
    return await res.json();
  } catch (err) {
    if (err instanceof EspnError) throw err;
    if (ctl.signal.aborted) throw new EspnError('upstream', 'ESPN took too long to answer. Try again in a minute.');
    throw new EspnError('upstream', `I couldn't reach ESPN (${(err as Error).message}).`);
  } finally {
    clearTimeout(timer);
  }
}

type Rec = Record<string, unknown>;
const obj = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export async function fetchSummary(eventId: string, league: League, deps: EspnDeps = {}): Promise<unknown> {
  const body = await espnJson(`${SITE}/${league}/summary?event=${encodeURIComponent(eventId)}`, deps);
  if (arr(obj(obj(arr(obj(obj(body).header).competitions)[0])).competitors).length < 2) {
    throw new EspnError('upstream', 'ESPN sent a game I could not read (the format may have changed).');
  }
  return body;
}

/** Athlete id -> position abbreviation from a team's current roster. Best effort: returns {} on any failure. */
export async function fetchRosterPositions(teamId: string, league: League, deps: EspnDeps = {}): Promise<Record<string, string>> {
  try {
    const body = obj(await espnJson(`${SITE}/${league}/teams/${encodeURIComponent(teamId)}/roster`, deps));
    const out: Record<string, string> = {};
    for (const group of arr(body.athletes)) {
      const items = arr(obj(group).items);
      for (const a of items.length ? items : [group]) {
        const rec = obj(a);
        const pos = str(obj(rec.position).abbreviation);
        if (str(rec.id) && pos) out[str(rec.id)] = pos;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// ---------- teams ----------

export type EspnTeam = {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
  nickname: string;
};

const teamsCache = new WeakMap<object, Map<League, Promise<EspnTeam[]>>>();

async function loadTeams(league: League, deps: EspnDeps): Promise<EspnTeam[]> {
  const key = deps.fetch ?? (globalThis as object);
  let perLeague = teamsCache.get(key);
  if (!perLeague) teamsCache.set(key, (perLeague = new Map()));
  let p = perLeague.get(league);
  if (!p) {
    p = (async () => {
      const body = obj(await espnJson(`${SITE}/${league}/teams?limit=1000`, deps));
      const rows = arr(obj(arr(obj(arr(body.sports)[0]).leagues)[0]).teams);
      return rows
        .map((r) => obj(obj(r).team))
        .filter((t) => str(t.id))
        .map((t) => ({
          id: str(t.id),
          abbreviation: str(t.abbreviation),
          displayName: str(t.displayName),
          shortDisplayName: str(t.shortDisplayName),
          location: str(t.location),
          nickname: str(t.nickname) || str(t.name),
        }));
    })();
    perLeague.set(league, p);
    p.catch(() => perLeague!.delete(league));
  }
  return p;
}

/** Tiny alias map: what people say -> what ESPN calls it (all normalized). */
const ALIASES: Record<string, string> = {
  uva: 'virginia',
  hoos: 'virginia',
  wahoos: 'virginia',
  unc: 'north carolina',
  vt: 'virginia tech',
  hokies: 'virginia tech',
  bama: 'alabama',
  nd: 'notre dame',
  uf: 'florida',
  gators: 'florida gators',
  cal: 'california',
  osu: 'ohio state',
  'ole miss': 'mississippi rebels',
  'texas am': 'texas a&m',
  pats: 'new england patriots',
  niners: 'san francisco 49ers',
  'the u': 'miami hurricanes',
};

export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const variants = (s: string): string[] => {
  const n = norm(s);
  const out = new Set([n, n.replace(/\bst\b/g, 'state'), n.replace(/\band\b/g, '').replace(/\s+/g, ' ').trim()]);
  return [...out];
};

/** Match strength of one query side against a team: 0 = none. Exact fields only. */
function exactScore(token: string, t: EspnTeam): number {
  const qs = new Set([...variants(token), ...(ALIASES[norm(token)] ? variants(ALIASES[norm(token)]) : [])]);
  const has = (field: string) => field !== '' && variants(field).some((v) => qs.has(v));
  if (has(t.displayName)) return 5;
  if (has(t.abbreviation)) return 5;
  if (has(t.shortDisplayName)) return 4;
  if (has(t.location)) return 4;
  if (has(t.nickname)) return 2;
  return 0;
}

/** Loose match: every query word appears in the team's full name. Used only when nothing matched exactly. */
function looseMatch(token: string, teams: EspnTeam[]): EspnTeam[] {
  const words = norm(token).split(' ').filter(Boolean);
  if (!words.length) return [];
  return teams.filter((t) => {
    const hay = norm(`${t.displayName} ${t.abbreviation}`).split(' ');
    return words.every((w) => hay.some((h) => h === w || (w.length >= 3 && h.startsWith(w))));
  });
}

type SideMatch = { team: EspnTeam; score: number };

function matchSide(token: string, teams: EspnTeam[]): SideMatch | { ambiguous: EspnTeam[] } | undefined {
  let best = 0;
  let winners: EspnTeam[] = [];
  for (const t of teams) {
    const s = exactScore(token, t);
    if (s === 0) continue;
    if (s > best) {
      best = s;
      winners = [t];
    } else if (s === best) winners.push(t);
  }
  if (winners.length === 1) return { team: winners[0], score: best };
  if (winners.length > 1) return { ambiguous: winners };
  const loose = looseMatch(token, teams);
  if (loose.length === 1) return { team: loose[0], score: 1 };
  if (loose.length > 1) return { ambiguous: loose };
  return undefined;
}

const SEPARATOR = /\s+(?:vs\.?|versus|v|at|against|and)\s+|\s*@\s*|\s+[-–—]\s+/i;

/** Pull a 4-digit season year out of the text. */
function splitYear(q: string): { text: string; year?: number } {
  const matches = [...q.matchAll(/\b(19[89]\d|20\d{2})\b/g)];
  const last = matches.at(-1);
  if (!last) return { text: q.trim() };
  const text = (q.slice(0, last.index) + ' ' + q.slice((last.index ?? 0) + last[0].length)).replace(/\s+/g, ' ').trim();
  return { text, year: Number(last[1]) };
}

function describeAmbiguous(token: string, teams: EspnTeam[]): string {
  const names = teams.slice(0, 4).map((t) => t.displayName);
  return `"${token}" could be ${names.join(', ')}${teams.length > 4 ? ', ...' : ''}. Try the school or city name.`;
}

/** Resolve two teams from free text against one league's team list. Throws not_found with a readable message. */
function resolveTeams(text: string, teams: EspnTeam[]): [EspnTeam, EspnTeam] | undefined {
  const parts = text.split(SEPARATOR).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const a = matchSide(parts[0], teams);
    const b = matchSide(parts[1], teams);
    if (a && 'ambiguous' in a) throw new EspnError('not_found', describeAmbiguous(parts[0], a.ambiguous));
    if (b && 'ambiguous' in b) throw new EspnError('not_found', describeAmbiguous(parts[1], b.ambiguous));
    if (a && b && 'team' in a && 'team' in b) {
      if (a.team.id === b.team.id) throw new EspnError('not_found', 'Those are the same team. Name two different teams.');
      return [a.team, b.team];
    }
    return undefined;
  }
  // No separator ("Virginia Florida State"): try every word split, keep the best total of exact matches.
  const words = text.split(/\s+/).filter(Boolean);
  let best: { score: number; pair: [EspnTeam, EspnTeam] } | undefined;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ');
    const right = words.slice(i).join(' ');
    const a = matchSide(left, teams);
    const b = matchSide(right, teams);
    if (!a || !b || 'ambiguous' in a || 'ambiguous' in b || a.team.id === b.team.id) continue;
    const score = a.score + b.score;
    if (!best || score > best.score) best = { score, pair: [a.team, b.team] };
  }
  return best?.pair;
}

// ---------- schedule lookup ----------

type ScheduleEvent = { id: string; name: string; date: string; status: string; completed: boolean; opponents: string[] };

async function loadSchedule(teamId: string, league: League, season: number, deps: EspnDeps): Promise<ScheduleEvent[]> {
  const base = `${SITE}/${league}/teams/${encodeURIComponent(teamId)}/schedule?season=${season}`;
  const bodies: unknown[] = [await espnJson(base, deps)];
  // Bowl / playoff games live under seasontype=3; a failure there is not fatal.
  try {
    bodies.push(await espnJson(`${base}&seasontype=3`, deps));
  } catch {
    /* ignore */
  }
  const seen = new Set<string>();
  const out: ScheduleEvent[] = [];
  for (const body of bodies) {
    for (const e of arr(obj(body).events)) {
      const ev = obj(e);
      const id = str(ev.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const comp = obj(arr(ev.competitions)[0]);
      const type = obj(obj(comp.status).type);
      out.push({
        id,
        name: str(ev.name),
        date: str(ev.date),
        status: str(type.description) || str(type.detail) || 'Scheduled',
        completed: type.completed === true,
        opponents: arr(comp.competitors).map((c) => str(obj(c).id) || str(obj(obj(c).team).id)),
      });
    }
  }
  return out;
}

const mostRecent = (events: ScheduleEvent[]): ScheduleEvent =>
  [...events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];

// ---------- public ----------

/** Season a bare "A vs B" most likely means: the one in progress or just finished. */
function defaultSeason(now: Date): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function parseEventRef(q: string): { eventId: string; league?: League } | undefined {
  const trimmed = q.trim();
  if (/^\d{6,}$/.test(trimmed)) return { eventId: trimmed };
  if (!/espn\./i.test(trimmed) && !/^https?:/i.test(trimmed)) return undefined;
  const m = /(?:gameId[/=]|[?&]event=|[?&]gameId=)(\d{6,})/i.exec(trimmed);
  if (!m) return undefined;
  const league: League | undefined = /\/nfl\b/i.test(trimmed) ? 'nfl' : /college-football/i.test(trimmed) ? 'college-football' : undefined;
  return { eventId: m[1], league };
}

function summaryHeader(summary: unknown): { title: string; date: string; status: string; completed: boolean } {
  const comp = obj(arr(obj(obj(summary).header).competitions)[0]);
  const type = obj(obj(comp.status).type);
  const competitors = arr(comp.competitors).map((c) => obj(c));
  const name = (side: string) => str(obj(obj(competitors.find((c) => c.homeAway === side)).team).displayName);
  return {
    title: name('away') && name('home') ? `${name('away')} at ${name('home')}` : str(obj(obj(summary).header).id),
    date: str(comp.date),
    status: str(type.description) || 'Unknown',
    completed: type.completed === true,
  };
}

/**
 * Turn "UVA vs FSU 2025", "Virginia Florida State 2025", an ESPN event id or an ESPN game URL into one event.
 * Several meetings in a season -> the most recent completed one.
 */
export async function resolveGame(query: string, deps: EspnDeps = {}): Promise<ResolvedGame> {
  const q = (query ?? '').trim();
  if (!q) throw new EspnError('bad_request', 'Tell me which game, like "UVA vs FSU 2025".');

  const ref = parseEventRef(q);
  if (ref) {
    const order = ref.league ? [ref.league] : [...LEAGUES];
    for (const league of order) {
      try {
        const summary = await fetchSummary(ref.eventId, league, deps);
        return { eventId: ref.eventId, league, ...summaryHeader(summary), summary };
      } catch (err) {
        if (err instanceof EspnError && err.kind === 'not_found') continue;
        throw err;
      }
    }
    throw new EspnError('not_found', `ESPN has no football game with id ${ref.eventId}.`);
  }

  const { text, year } = splitYear(q);
  if (!text) throw new EspnError('bad_request', 'Tell me which teams, like "UVA vs FSU 2025".');
  const now = deps.now?.() ?? new Date();
  const seasons = year !== undefined ? [year] : [defaultSeason(now), defaultSeason(now) - 1];

  let teamsFound = false;
  let lastPair = '';
  for (const league of LEAGUES) {
    const teams = await loadTeams(league, deps);
    const pair = resolveTeams(text, teams);
    if (!pair) continue;
    teamsFound = true;
    lastPair = `${pair[0].displayName} vs ${pair[1].displayName}`;
    for (const season of seasons) {
      const events = (await loadSchedule(pair[0].id, league, season, deps)).filter((e) => e.opponents.includes(pair[1].id));
      if (!events.length) continue;
      const done = events.filter((e) => e.completed);
      const pick = mostRecent(done.length ? done : events);
      return { eventId: pick.id, league, title: pick.name, date: pick.date, status: pick.status, completed: pick.completed };
    }
  }
  if (teamsFound) {
    const when = year !== undefined ? ` in ${year}` : ' in the last two seasons';
    throw new EspnError('not_found', `I found the teams (${lastPair}) but no game between them${when}.`);
  }
  throw new EspnError('not_found', `I couldn't work out two teams from "${q}". Try "UVA vs FSU 2025".`);
}
