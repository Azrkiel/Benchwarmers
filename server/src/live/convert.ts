// Pure converter: an ESPN game summary -> a replayable football `Game`. No I/O. Used only by the runtime importer;
// committed demo games stay fictional. Event shapes mirror server/src/game/games/riverton-vs-ironwood.json.
import type { DriveResult, DriveState, Game, GameEvent, Player, Position, Team } from '../shared/types.js';

type Rec = Record<string, unknown>;
const obj = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Game seconds per football quarter / of regulation / per overtime window. */
const QUARTER_SEC = 120;
const REGULATION_SEC = 480;
const OT_SEC = 60;
const CLOCK_SCALE = 7.5; // football clock seconds per game second (matches engine FOOTBALL_CLOCK_SCALE)
const NUDGE = 0.01;

export type RosterPositions = Record<string, string>;

type Side = 'home' | 'away';
type TeamInfo = { id: string; short: string; name: string; nick: string; color: string; alt: string; score: number };
type RosterEntry = { p: Player; full: string; first: string; last: string };

// ---------- names ----------

const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
function nameTokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !SUFFIX.has(t));
}

function toEntry(p: Player): RosterEntry {
  const t = nameTokens(p.name);
  return { p, full: t.join(' '), first: t[0] ?? '', last: t.at(-1) ?? '' };
}

function findPlayer(roster: RosterEntry[], raw: string | undefined): Player | undefined {
  if (!raw) return undefined;
  const t = nameTokens(raw);
  if (!t.length) return undefined;
  const full = t.join(' ');
  const exact = roster.filter((r) => r.full === full);
  if (exact.length === 1) return exact[0].p;
  const first = t[0];
  const last = t.at(-1)!;
  const sameLast = roster.filter((r) => r.last === last);
  if (t.length > 1) {
    const close = sameLast.filter((r) => r.first.startsWith(first) || first.startsWith(r.first) || r.first[0] === first[0]);
    if (close.length === 1) return close[0].p;
  }
  if (sameLast.length === 1 && (t.length === 1 || sameLast[0].first[0] === first[0] || t.length > 1)) return sameLast[0].p;
  return undefined;
}

// ---------- roster ----------

function mapPos(p: string | undefined): Position | undefined {
  switch ((p ?? '').toUpperCase()) {
    case 'QB':
      return 'QB';
    case 'RB':
    case 'FB':
    case 'HB':
    case 'TB':
      return 'RB';
    case 'WR':
      return 'WR';
    case 'TE':
      return 'TE';
    case 'K':
    case 'PK':
      return 'K';
    default:
      return undefined;
  }
}

type Role = { passing?: number; rushing?: number; receiving?: number; kicking?: boolean };

function statByKey(cat: Rec, athlete: Rec, key: string): number {
  const keys = arr(cat.keys).map(str);
  const i = keys.indexOf(key);
  if (i < 0) return 0;
  const v = str(arr(athlete.stats)[i]);
  return Number.parseInt(v.includes('/') ? v.split('/')[1] : v, 10) || 0;
}

function buildRosters(
  summary: unknown,
  teams: Record<Side, TeamInfo>,
  positions: RosterPositions,
): Record<Side, { players: Player[]; index: RosterEntry[] }> {
  const out: Record<Side, { players: Player[]; index: RosterEntry[] }> = {
    home: { players: [], index: [] },
    away: { players: [], index: [] },
  };
  const usedIds = new Set<string>();
  for (const teamBox of arr(obj(obj(summary).boxscore).players)) {
    const tb = obj(teamBox);
    const teamId = str(obj(tb.team).id);
    const side: Side | undefined = teams.home.id === teamId ? 'home' : teams.away.id === teamId ? 'away' : undefined;
    if (!side) continue;
    const team = teams[side];
    const roles = new Map<string, { name: string; jersey: string; role: Role }>();
    for (const c of arr(tb.statistics)) {
      const cat = obj(c);
      const cname = str(cat.name);
      if (!['passing', 'rushing', 'receiving', 'kicking'].includes(cname)) continue;
      for (const a of arr(cat.athletes)) {
        const rec = obj(a);
        const ath = obj(rec.athlete);
        const id = str(ath.id);
        if (!id || /^team$/i.test(str(ath.displayName).trim())) continue;
        const e = roles.get(id) ?? { name: str(ath.displayName) || str(ath.fullName), jersey: str(ath.jersey), role: {} };
        if (cname === 'passing') e.role.passing = statByKey(cat, rec, 'completions/passingAttempts');
        else if (cname === 'rushing') e.role.rushing = statByKey(cat, rec, 'rushingAttempts');
        else if (cname === 'receiving') e.role.receiving = statByKey(cat, rec, 'receptions');
        else e.role.kicking = true;
        roles.set(id, e);
      }
    }
    let spare = 90; // stable unique small numbers for players ESPN lists without a jersey
    const takenNumbers = new Set<number>();
    for (const [athleteId, e] of roles) {
      const r = e.role;
      let pos = mapPos(positions[athleteId]);
      if (!pos) {
        if (r.kicking && r.passing === undefined && r.rushing === undefined && r.receiving === undefined) pos = 'K';
        else if (r.passing !== undefined && ((r.passing ?? 0) >= 5 || (r.rushing === undefined && r.receiving === undefined))) pos = 'QB';
        else if (r.rushing !== undefined && r.receiving === undefined) pos = 'RB';
        else if (r.receiving !== undefined && r.rushing === undefined) pos = 'WR';
        else pos = (r.rushing ?? 0) >= (r.receiving ?? 0) ? 'RB' : 'WR';
      }
      let number = e.jersey !== '' && /^\d{1,3}$/.test(e.jersey) ? Number(e.jersey) : NaN;
      if (!Number.isFinite(number) || takenNumbers.has(number)) {
        while (takenNumbers.has(spare)) spare++;
        number = spare;
      }
      takenNumbers.add(number);
      const base = `${team.short.toLowerCase().replace(/[^a-z0-9]/g, '')}-${pos.toLowerCase()}-${number}`;
      let id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      usedIds.add(id);
      out[side].players.push({ id, teamId: team.id, name: e.name, number, position: pos });
    }
    const order: Position[] = ['QB', 'RB', 'WR', 'TE', 'K'];
    out[side].players.sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position) || a.number - b.number);
    out[side].index = out[side].players.map(toEntry);
  }
  return out;
}

// ---------- colors ----------

function hex(c: string): string | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  return m ? `#${m[1].toLowerCase()}` : undefined;
}
function dist(a: string, b: string): number {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.hypot(ch(a, 0) - ch(b, 0), ch(a, 1) - ch(b, 1), ch(a, 2) - ch(b, 2));
}

/** Team colors as `#rrggbb`; if the two primaries are too close, fall back to alternates so they differ visibly. */
function pickColors(home: TeamInfo, away: TeamInfo): { home: string; away: string } {
  let h = hex(home.color) ?? '#2f5d8a';
  let a = hex(away.color) ?? '#a8432f';
  const MIN = 110;
  if (dist(h, a) < MIN) {
    const aAlt = hex(away.alt);
    const hAlt = hex(home.alt);
    if (aAlt && dist(h, aAlt) >= MIN) a = aAlt;
    else if (hAlt && dist(hAlt, a) >= MIN) h = hAlt;
    else if (aAlt && hAlt && dist(hAlt, aAlt) >= MIN) {
      h = hAlt;
      a = aAlt;
    } else if (dist(h, a) < MIN) a = '#d9a441';
  }
  return { home: h, away: a };
}

// ---------- plays ----------

type Pending = { period: number; clock: number | null; ev: GameEvent };

const clockSeconds = (v: unknown): number | null => {
  const m = /^(\d+):(\d{2})$/.exec(str(v).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const TD_PASS = /^(.+?) pass complete (?:\w+ )*?to (.+?) for (-?\d+) yds? for a TD/i;
const TD_RUSH = /^(.+?) run for (-?\d+) yds? for a TD/i;
const TD_RUSH_ALT = /^(.+?) (\d+) Yd Run/i;
const TD_PASS_ALT = /^(.+?) (\d+) Yd Pass from (.+?)(?: \(|$)/i;
const PASS = /^(.+?) pass complete (?:\w+ )*?to (.+?) for (?:(-?\d+) yds?|no gain|a loss of (\d+) yards?)/i;
const RUSH = /^(.+?) run for (?:(-?\d+) yds?|no gain|a loss of (\d+) yards?)/i;
const INCOMPLETE = /^(.+?) pass incomplete/i;
const INTERCEPT = /^(.+?) pass intercepted/i;
const FG_GOOD = /^(.+?) (\d+) Yd Field Goal/i;
const FG_MISS = /^(.+?) (\d+) yd FG (?:MISSED|BLOCKED)/i;
const KICK_PAREN = /\(([^()]+?) KICK\)/i;
const CONVERSION = /\(([^()]*(?:two[- ]point|2[- ]pt)[^()]*)\)/i;

function yardsOf(m: RegExpExecArray, signedIdx: number, lossIdx: number): number {
  if (m[signedIdx] !== undefined) return Number(m[signedIdx]);
  if (m[lossIdx] !== undefined) return -Number(m[lossIdx]);
  return 0;
}

function cleanText(text: string, max = 130): string {
  const pen = /\bPENALTY\s+(.+)$/.exec(text);
  let s = (pen ? `Penalty: ${pen[1]}` : text)
    .replace(/\s+/g, ' ')
    .replace(KICK_PAREN, '')
    .replace(/\s+for a TD\b/i, '')
    .replace(/\s+to the (?:[A-Z]{2,6}\.? \d{1,2}|\d{1,2} yard line)\b/g, '')
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}...`;
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function driveResultOf(display: string, scoredBySide: Set<Side>, side: Side): DriveResult {
  const d = display.toLowerCase();
  let r: DriveResult;
  if (d.includes('safety')) r = 'safety';
  else if (d.includes('touchdown') || d === 'td') r = 'td';
  else if (d.includes('field goal') || d === 'fg') r = d.includes('miss') || d.includes('block') ? 'missed_fg' : 'fg';
  else if (d.includes('missed') || d.includes('blocked')) r = d.includes('punt') ? 'punt' : 'missed_fg';
  else if (d.includes('punt')) r = 'punt';
  else if (d.includes('interception') || d.includes('fumble') || d.includes('turnover')) r = 'turnover';
  else if (d.includes('downs')) r = 'downs';
  else if (d.includes('half') || d.includes('end of') || d.includes('game') || d.includes('regulation')) r = 'end_of_half';
  else r = 'punt';
  // A "touchdown" the other team scored (pick-six) ends this drive as a turnover.
  if (r === 'td' && !scoredBySide.has(side)) r = 'turnover';
  return r;
}

function driveEndText(result: DriveResult, nick: string): string {
  switch (result) {
    case 'td':
      return `Drive over: touchdown for the ${nick}.`;
    case 'fg':
      return `Drive over: field goal for the ${nick}.`;
    case 'missed_fg':
      return `Drive over: the ${nick} miss the field goal.`;
    case 'punt':
      return `Drive over: the ${nick} punt it away.`;
    case 'turnover':
      return `Drive over: turnover by the ${nick}.`;
    case 'downs':
      return `Drive over: turnover on downs for the ${nick}.`;
    case 'safety':
      return `Drive over: safety against the ${nick}.`;
    default:
      return 'Drive over: time expires.';
  }
}

function startYardline(drive: Rec, offAbbr: string, firstPlay: Rec | undefined): number {
  const m = /^([A-Z0-9&.\- ]*?)\s*(\d{1,2})$/.exec(str(obj(drive.start).text).trim());
  if (m) {
    const n = Number(m[2]);
    const own = m[1].trim() === '' ? undefined : m[1].trim().toUpperCase() === offAbbr.toUpperCase();
    if (own === undefined) return 50;
    return Math.min(99, Math.max(1, own ? 100 - n : n));
  }
  const y = num(obj(obj(firstPlay).start).yardsToEndzone);
  return Number.isFinite(y) && y >= 1 ? Math.min(99, Math.round(y)) : 75;
}

// ---------- main ----------

export function espnSummaryToGame(summary: unknown, rosterPositions: RosterPositions = {}): Game {
  const root = obj(summary);
  const header = obj(root.header);
  const eventId = str(header.id) || str(obj(arr(header.competitions)[0]).id);
  const comp = obj(arr(header.competitions)[0]);
  const infos: Partial<Record<Side, TeamInfo>> = {};
  for (const c of arr(comp.competitors)) {
    const rec = obj(c);
    const t = obj(rec.team);
    const side = rec.homeAway === 'home' ? 'home' : rec.homeAway === 'away' ? 'away' : undefined;
    if (!side) continue;
    const display = str(t.displayName) || str(t.name) || (side === 'home' ? 'Home' : 'Away');
    infos[side] = {
      id: '',
      short: (str(t.abbreviation) || display.slice(0, 3)).toUpperCase(),
      name: display,
      nick: str(t.name) || display.split(' ').at(-1)!,
      color: str(t.color),
      alt: str(t.alternateColor),
      score: num(rec.score),
    };
    (infos[side] as TeamInfo & { espnId?: string }).espnId = str(t.id) || str(rec.id);
  }
  if (!infos.home || !infos.away) throw new Error('ESPN summary has no home/away competitors');
  const home = infos.home;
  const away = infos.away;
  const espnIds: Record<Side, string> = {
    home: (home as TeamInfo & { espnId?: string }).espnId ?? '',
    away: (away as TeamInfo & { espnId?: string }).espnId ?? '',
  };
  home.id = home.short.toLowerCase().replace(/[^a-z0-9]/g, '') || 'home';
  away.id = away.short.toLowerCase().replace(/[^a-z0-9]/g, '') || 'away';
  if (home.id === away.id) away.id = `${away.id}2`;
  const teams: Record<Side, TeamInfo> = { home, away };
  const sideOfEspn = (id: string): Side | undefined => (id === espnIds.home ? 'home' : id === espnIds.away ? 'away' : undefined);

  // Box-score rosters are keyed by ESPN team id, so temporarily expose it through `id` while matching.
  const rosterTeams: Record<Side, TeamInfo> = { home: { ...home, id: espnIds.home }, away: { ...away, id: espnIds.away } };
  const rosters = buildRosters(summary, rosterTeams, rosterPositions);
  for (const s of ['home', 'away'] as const) for (const p of rosters[s].players) p.teamId = teams[s].id;

  const runs: Record<Side, number> = { home: 0, away: 0 };
  const pending: Pending[] = [];
  const push = (period: number, clock: number | null, ev: Omit<GameEvent, 't'> & { t?: number }) => {
    pending.push({ period, clock, ev: { t: 0, ...ev } as GameEvent });
  };
  const tally = (side: Side): string => {
    const other: Side = side === 'home' ? 'away' : 'home';
    return `${teams[side].nick} ${runs[side]}, ${teams[other].nick} ${runs[other]}.`;
  };
  const lone = (side: Side, pos: Position): Player | undefined => {
    const list = rosters[side].players.filter((p) => p.position === pos);
    return list.length === 1 ? list[0] : undefined;
  };

  const drives = [...arr(obj(root.drives).previous), ...arr(obj(root.drives).current)].map(obj);
  let maxPeriod = 4;
  let driveNo = 0;

  for (const drive of drives) {
    const plays = arr(drive.plays).map(obj);
    const driveSide = sideOfEspn(str(obj(drive.team).id));
    if (!driveSide) continue;
    driveNo++;
    const dId = `d${String(driveNo).padStart(2, '0')}`;
    const firstReal = plays.find((p) => str(obj(p.type).text) !== 'Kickoff' && str(obj(p.type).text) !== 'Timeout');
    const startPeriod = num(obj(obj(drive.start).period).number) || num(obj(plays[0]?.period).number) || 1;
    const startClock = clockSeconds(obj(obj(drive.start).clock).displayValue) ?? clockSeconds(obj(obj(plays[0]).clock).displayValue);
    const yl = startYardline(drive, teams[driveSide].short, firstReal);
    const state: DriveState = {
      id: dId,
      team: driveSide,
      yardline100: yl,
      halfSecondsRemaining: startPeriod > 4 ? 600 : (startPeriod % 2 === 1 ? 900 : 0) + (startClock ?? 0),
    };
    maxPeriod = Math.max(maxPeriod, startPeriod);
    const oppAbbr = teams[driveSide === 'home' ? 'away' : 'home'].short;
    push(startPeriod, startClock, {
      type: 'drive',
      team: driveSide,
      text: `${teams[driveSide].nick} take over at ${yl >= 50 ? `their own ${100 - yl}` : `the ${oppAbbr} ${yl}`}.`,
      tags: ['drive', 'start'],
      drive: state,
    });

    const scoredBy = new Set<Side>();
    let lastPeriod = startPeriod;
    let lastClock = startClock;

    for (const play of plays) {
      const type = str(obj(play.type).text);
      if (type === 'Timeout') continue;
      const period = num(obj(play.period).number) || lastPeriod;
      const clock = clockSeconds(obj(play.clock).displayValue);
      maxPeriod = Math.max(maxPeriod, period);
      lastPeriod = period;
      if (clock !== null) lastClock = clock;
      if (/^End (Period|of)/i.test(type)) continue; // period markers are generated from fixed boundaries
      const text = str(play.text).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const emit = (ev: Omit<GameEvent, 't'>) => push(period, clock, ev);

      const offense = arr(play.teamParticipants).map(obj).find((p) => p.type === 'offense');
      const off: Side = sideOfEspn(str(offense?.id)) ?? driveSide;
      const def: Side = off === 'home' ? 'away' : 'home';
      const roster = rosters[off].index;
      const pl = (n: string | undefined) => findPlayer(roster, n);

      const h = num(play.homeScore);
      const a = num(play.awayScore);
      const dHome = Number.isFinite(h) ? Math.max(0, h - runs.home) : 0;
      const dAway = Number.isFinite(a) ? Math.max(0, a - runs.away) : 0;
      const scoring: { side: Side; delta: number }[] = [];
      if (dHome > 0) scoring.push({ side: 'home', delta: dHome });
      if (dAway > 0) scoring.push({ side: 'away', delta: dAway });
      const scoredOffense = scoring.some((s) => s.side === off);

      let handled = false; // base play event(s) emitted

      // --- offensive touchdowns: a yardage play, then the score event (as riverton does)
      let tdInfo: { kind: 'pass' | 'rush'; passer?: string; target: string; yards: number } | undefined;
      let m: RegExpExecArray | null;
      if (scoredOffense && (m = TD_PASS.exec(text))) tdInfo = { kind: 'pass', passer: m[1], target: m[2], yards: Number(m[3]) };
      else if (scoredOffense && (m = TD_RUSH.exec(text))) tdInfo = { kind: 'rush', target: m[1], yards: Number(m[2]) };
      else if (scoredOffense && (m = TD_PASS_ALT.exec(text))) tdInfo = { kind: 'pass', passer: m[3], target: m[1], yards: Number(m[2]) };
      else if (scoredOffense && (m = TD_RUSH_ALT.exec(text))) tdInfo = { kind: 'rush', target: m[1], yards: Number(m[2]) };

      if (tdInfo) {
        handled = true;
        const target = pl(tdInfo.target);
        const passer = tdInfo.passer ? pl(tdInfo.passer) : undefined;
        if (tdInfo.kind === 'pass') {
          emit({
            type: 'play',
            team: off,
            text: `${tdInfo.passer ?? 'The QB'} hits ${tdInfo.target} for ${tdInfo.yards}.`,
            tags: ['pass'],
            ...(target ? { playerId: target.id, stat: 'rec_yds' as const, yards: tdInfo.yards, ...(passer ? { assistPlayerId: passer.id } : {}) } : {}),
          });
        } else {
          emit({
            type: 'play',
            team: off,
            text: `${tdInfo.target} runs for ${tdInfo.yards}.`,
            tags: ['rush'],
            ...(target ? { playerId: target.id, stat: 'rush_yds' as const, yards: tdInfo.yards } : {}),
          });
        }
        const delta = scoring.find((s) => s.side === off)!.delta;
        const tdPts = Math.min(6, delta);
        runs[off] += tdPts;
        scoredBy.add(off);
        emit({
          type: 'score',
          team: off,
          points: tdPts,
          text:
            tdInfo.kind === 'pass'
              ? `Touchdown, ${teams[off].nick}! ${tdInfo.target} ${tdInfo.yards}-yard catch${tdInfo.passer ? ` from ${tdInfo.passer}` : ''}. ${tally(off)}`
              : `Touchdown, ${teams[off].nick}! ${tdInfo.target} scores from ${tdInfo.yards}. ${tally(off)}`,
          tags: ['touchdown', tdInfo.kind],
          ...(target
            ? tdInfo.kind === 'pass'
              ? { playerId: target.id, stat: 'rec_td' as const, ...(passer ? { assistPlayerId: passer.id } : {}) }
              : { playerId: target.id, stat: 'rush_td' as const }
            : {}),
        });
        extras(off, delta - tdPts, text);
      }

      if (!handled) {
        // --- ordinary plays
        if (type === 'Kickoff') {
          emit({ type: 'play', text: cleanText(text), tags: ['kickoff'] });
        } else if (type === 'Punt') {
          emit({ type: 'play', team: off, text: cleanText(text), tags: ['punt'] });
        } else if (type === 'Penalty' || /^Penalty/i.test(type)) {
          emit({ type: 'foul', text: cleanText(text, 110), tags: ['penalty'] });
        } else if ((m = INTERCEPT.exec(text))) {
          const qb = pl(m[1]);
          emit({
            type: 'play',
            team: off,
            text: `Interception! ${cleanText(text, 110)}`,
            tags: ['turnover', 'interception'],
            ...(qb ? { playerId: qb.id, stat: 'int' as const } : {}),
          });
        } else if (FG_MISS.test(text) || type === 'Field Goal Missed') {
          const fm = FG_MISS.exec(text);
          emit({ type: 'play', team: off, text: fm ? `${fm[1]} misses a ${fm[2]}-yard field goal.` : cleanText(text), tags: ['field-goal', 'missed'] });
        } else if ((m = PASS.exec(text))) {
          const y = yardsOf(m, 3, 4);
          const target = pl(m[2]);
          const passer = pl(m[1]);
          emit({
            type: 'play',
            team: off,
            text: cleanText(text),
            tags: ['pass'],
            ...(target && y !== 0 ? { playerId: target.id, stat: 'rec_yds' as const, yards: y, ...(passer ? { assistPlayerId: passer.id } : {}) } : {}),
          });
        } else if ((m = RUSH.exec(text))) {
          const y = yardsOf(m, 2, 3);
          const rb = pl(m[1]);
          emit({
            type: 'play',
            team: off,
            text: cleanText(text),
            tags: ['rush'],
            ...(rb && y !== 0 ? { playerId: rb.id, stat: 'rush_yds' as const, yards: y } : {}),
          });
        } else if (INCOMPLETE.test(text)) {
          emit({ type: 'play', team: off, text: cleanText(text), tags: ['pass', 'incomplete'] });
        } else if (/ sacked by /i.test(text)) {
          emit({ type: 'play', team: off, text: cleanText(text), tags: ['sack'] });
        } else if (!scoring.length) {
          // Unknown plain play. (Unreadable scoring plays get their score event from the delta below.)
          emit({ type: 'play', team: off, text: cleanText(text), tags: ['play'] });
        }

        // lost fumble (defense recovered): its own turnover event on the fumbler
        if (/Fumble Recovery \(Opponent\)/i.test(type)) {
          const fumbler = roster.find((r) => text.toLowerCase().includes(`${r.p.name.toLowerCase()} fumbled`))?.p ?? pl(/(\S+(?: \S+)?) fumbled/i.exec(text)?.[1]);
          emit({
            type: 'play',
            team: off,
            text: `Fumble! ${fumbler?.name ?? 'The ball carrier'} coughs it up and ${teams[def].nick} recover.`,
            tags: ['turnover', 'fumble'],
            ...(fumbler ? { playerId: fumbler.id, stat: 'fumble' as const } : {}),
          });
        }

        // --- scores read from the score delta (field goals, XP/2-pt, safeties, defensive scores)
        for (const { side, delta } of scoring) {
          const nick = teams[side].nick;
          const sideRoster = rosters[side].index;
          if (FG_GOOD.test(text) && delta === 3 && side === off) {
            const fm = FG_GOOD.exec(text)!;
            const kicker = findPlayer(sideRoster, fm[1]);
            runs[side] += 3;
            scoredBy.add(side);
            emit({
              type: 'score',
              team: side,
              points: 3,
              text: `${fm[1]} kicks a ${fm[2]}-yard field goal. ${tally(side)}`,
              tags: ['field-goal'],
              ...(kicker ? { playerId: kicker.id, stat: 'fg' as const } : {}),
            });
          } else if (delta >= 6 || /touchdown/i.test(type)) {
            const tdPts = Math.min(6, delta);
            runs[side] += tdPts;
            scoredBy.add(side);
            emit({ type: 'score', team: side, points: tdPts, text: `Touchdown, ${nick}! ${cleanText(text, 100)} ${tally(side)}`, tags: ['touchdown'] });
            extras(side, delta - tdPts, text);
          } else if (delta === 3) {
            runs[side] += 3;
            scoredBy.add(side);
            emit({ type: 'score', team: side, points: 3, text: `Field goal, ${nick}. ${tally(side)}`, tags: ['field-goal'] });
          } else if (delta === 1 || (delta === 2 && /two[- ]point|conversion/i.test(text))) {
            extras(side, delta, text);
          } else if (delta === 2) {
            runs[side] += 2;
            emit({ type: 'score', team: side, points: 2, text: `Safety! ${nick} get two. ${cleanText(text, 90)} ${tally(side)}`, tags: ['safety'] });
          } else {
            runs[side] += delta;
            emit({ type: 'score', team: side, points: delta, text: `${nick} score. ${cleanText(text, 90)} ${tally(side)}`, tags: ['score'] });
          }
        }
      }

      // Extra point / two-point conversion that follows a touchdown (remaining delta after the 6).
      function extras(side: Side, remaining: number, fullText: string): void {
        if (remaining <= 0) return;
        const nick = teams[side].nick;
        if (remaining === 1) {
          const kickName = KICK_PAREN.exec(fullText)?.[1];
          const kicker = (kickName ? findPlayer(rosters[side].index, kickName) : undefined) ?? (kickName ? undefined : lone(side, 'K'));
          runs[side] += 1;
          emit({
            type: 'score',
            team: side,
            points: 1,
            text: `${kickName ?? kicker?.name ?? 'The kicker'} adds the extra point. ${tally(side)}`,
            tags: ['extra-point'],
            ...(kicker ? { playerId: kicker.id, stat: 'xp' as const } : {}),
          });
        } else if (remaining === 2) {
          const detail = CONVERSION.exec(fullText)?.[1];
          runs[side] += 2;
          emit({
            type: 'score',
            team: side,
            points: 2,
            text: `Two-point try is good! ${nick}${detail ? `: ${detail.replace(/\s*for Two-Point Conversion/i, '')}` : ''}. ${tally(side)}`,
            tags: ['two-point'],
          });
        } else {
          runs[side] += remaining;
          emit({ type: 'score', team: side, points: remaining, text: `${nick} add ${remaining}. ${tally(side)}`, tags: ['score'] });
        }
      }
    }

    const result = driveResultOf(str(drive.displayResult) || str(drive.result), scoredBy, driveSide);
    push(lastPeriod, lastClock, {
      type: 'drive',
      team: driveSide,
      text: driveEndText(result, teams[driveSide].nick),
      tags: ['drive', 'end', result],
      drive: state,
      driveResult: result,
    });
  }

  // Reconcile with the final score (plays ESPN did not flag, dropped plays): never let totals disagree with reality.
  for (const side of ['home', 'away'] as const) {
    const finalScore = teams[side].score;
    if (Number.isFinite(finalScore) && runs[side] < finalScore) {
      const diff = finalScore - runs[side];
      runs[side] = finalScore;
      const last = pending.at(-1);
      pending.push({
        period: last?.period ?? 4,
        clock: last?.clock ?? 0,
        ev: { t: 0, type: 'score', team: side, points: diff, text: `${teams[side].nick} score ${diff} more. ${tally(side)}`, tags: ['score'] },
      });
    }
  }

  const otCount = maxPeriod - 4;
  const events = assignTimes(pending, otCount);
  insertPeriodMarkers(events, teams, otCount);

  const color = pickColors(home, away);
  const team = (s: Side): Team => ({
    id: teams[s].id,
    name: teams[s].name,
    short: teams[s].short,
    color: color[s],
    roster: rosters[s].players,
  });
  return {
    id: `espn-${eventId}`,
    title: `${away.name} at ${home.name}`,
    sport: 'football',
    home: team('home'),
    away: team('away'),
    durationSec: REGULATION_SEC + OT_SEC * otCount,
    periods: 4 + otCount,
    ...(otCount > 0 ? { regulationSec: REGULATION_SEC } : {}),
    ...(str(comp.date) ? { scheduledFor: str(comp.date) } : {}),
    events,
  };
}

// ---------- timing ----------

const r2 = (x: number): number => Math.round(x * 100) / 100;

function assignTimes(pending: Pending[], otCount: number): GameEvent[] {
  const out: GameEvent[] = [];
  // Regulation: map the football clock to game seconds, keep order, spread ties.
  const reg = pending.filter((p) => p.period <= 4);
  let prevRaw = 0;
  const raws = reg.map((p) => {
    const c = p.clock ?? null;
    let raw = c === null ? prevRaw : (p.period - 1) * QUARTER_SEC + (900 - Math.min(900, c)) / CLOCK_SCALE;
    raw = Math.max(raw, prevRaw);
    prevRaw = raw;
    return raw;
  });
  let i = 0;
  let last = -Infinity;
  while (i < reg.length) {
    let j = i;
    while (j + 1 < reg.length && reg[j + 1].period === reg[i].period && Math.abs(raws[j + 1] - raws[i]) < 1e-9) j++;
    const n = j - i + 1;
    const raw = raws[i];
    const endOfPeriod = raw >= reg[i].period * QUARTER_SEC - 1e-9;
    for (let k = 0; k < n; k++) {
      let t = endOfPeriod ? raw - NUDGE * (n - k) : raw + NUDGE * k;
      t = r2(Math.max(t, last));
      last = t;
      out.push({ ...reg[i + k].ev, t });
    }
    i = j + 1;
  }
  // Overtime: each period gets a 60 game-second window, plays spread evenly.
  for (let k = 1; k <= otCount; k++) {
    const mine = pending.filter((p) => p.period === 4 + k);
    const start = REGULATION_SEC + OT_SEC * (k - 1);
    const n = mine.length;
    mine.forEach((p, idx) => out.push({ ...p.ev, t: r2(start + 2 + (n <= 1 ? 0 : (idx * 56) / (n - 1))) }));
  }
  return out;
}

function insertPeriodMarkers(events: GameEvent[], teams: Record<Side, TeamInfo>, otCount: number): void {
  const total = (upTo: number): string => {
    const s = { home: 0, away: 0 };
    for (const e of events) if (e.type === 'score' && e.team && e.t < upTo) s[e.team] += e.points ?? 0;
    return `${teams.home.nick} ${s.home}, ${teams.away.nick} ${s.away}`;
  };
  const finalLine = (): string => {
    const s = { home: 0, away: 0 };
    for (const e of events) if (e.type === 'score' && e.team) s[e.team] += e.points ?? 0;
    const lead: Side = s.home >= s.away ? 'home' : 'away';
    const other: Side = lead === 'home' ? 'away' : 'home';
    return `${teams[lead].nick} ${s[lead]}, ${teams[other].nick} ${s[other]}`;
  };
  const markers: { t: number; text: string }[] = [
    { t: 1 * QUARTER_SEC, text: `End of the first quarter. ${total(QUARTER_SEC)}.` },
    { t: 2 * QUARTER_SEC, text: `Halftime. ${total(2 * QUARTER_SEC)}.` },
    { t: 3 * QUARTER_SEC, text: `End of the third quarter. ${total(3 * QUARTER_SEC)}.` },
  ];
  const names = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
  if (otCount > 0) {
    markers.push({ t: REGULATION_SEC, text: `End of regulation. ${total(REGULATION_SEC)}. Overtime!` });
    for (let k = 1; k < otCount; k++) {
      const t = REGULATION_SEC + OT_SEC * k;
      markers.push({ t, text: `End of the ${names[k] ?? `${k}th`} overtime. ${total(t)}.` });
    }
  }
  markers.push({ t: REGULATION_SEC + OT_SEC * otCount, text: `Final: ${finalLine()}.` });
  for (const m of markers) {
    const ev: GameEvent = { t: m.t, type: 'period', text: m.text, tags: ['period'] };
    const at = events.findIndex((e) => e.t >= m.t);
    if (at < 0) events.push(ev);
    else events.splice(at, 0, ev);
  }
}
