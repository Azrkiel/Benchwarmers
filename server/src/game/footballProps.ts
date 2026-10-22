// Pure builders for football drive props (shared by scripts/build-football-props.ts and the runtime importer).
import type { DriveState, Game, Prop } from '../shared/types.js';
import { driveOddsProp } from './odds.js';

export const FOOTBALL_GAME_ID = 'riverton-vs-ironwood';

/** Which drives become props, and which question each asks. Windows never overlap (drives are sequential). */
export const FOOTBALL_PICKS: { driveId: string; outcome: 'score' | 'td' }[] = [
  { driveId: 'd01', outcome: 'score' },
  { driveId: 'd02', outcome: 'td' },
  { driveId: 'd03', outcome: 'score' },
  { driveId: 'd04', outcome: 'td' },
  { driveId: 'd07', outcome: 'td' },
  { driveId: 'd08', outcome: 'score' },
  { driveId: 'd09', outcome: 'td' },
  { driveId: 'd10', outcome: 'score' },
];

const LOCK_AFTER_SEC = 30;

/** Auto-picked props (imported real games): ~8 drives spread over the game, windows never overlap. */
const AUTO_PROP_COUNT = 8;
/** A drive must last at least this many game seconds, so a prop can open, lock and still resolve later. */
const MIN_DRIVE_SEC = 14;
const AUTO_LOCK_FRACTION = 0.6;
const AUTO_MIN_LOCK_SEC = 6;

function teamNickname(game: Game, side: 'home' | 'away'): string {
  const name = (side === 'home' ? game.home : game.away).name;
  return name.split(' ').at(-1)!;
}

/** Seconds a prop stays open: a fixed 30 for hand-picked drives, 60% of the drive (6-30 s) for auto picks. */
function lockAfter(auto: boolean, startT: number, endT: number): number {
  if (!auto) return LOCK_AFTER_SEC;
  return Math.round(Math.min(LOCK_AFTER_SEC, Math.max(AUTO_MIN_LOCK_SEC, (endT - startT) * AUTO_LOCK_FRACTION)) * 100) / 100;
}

type Pick = { driveId: string; outcome: 'score' | 'td' };

/**
 * Pure: choose ~8 non-overlapping drives spread across the game, alternating 'score' / 'td'. Drives too short to lock
 * (start..end under MIN_DRIVE_SEC) are skipped; the first and last eligible drives are always included.
 */
export function autoFootballPicks(game: Game, count = AUTO_PROP_COUNT): Pick[] {
  const eligible: { id: string; start: number }[] = [];
  for (const e of game.events) {
    if (e.type !== 'drive' || e.driveResult !== undefined || !e.drive) continue;
    const end = game.events.find((x) => x.driveResult !== undefined && x.drive?.id === e.drive!.id);
    if (!end || end.t - e.t < MIN_DRIVE_SEC) continue;
    eligible.push({ id: e.drive.id, start: e.t });
  }
  eligible.sort((a, b) => a.start - b.start);
  const n = Math.min(count, eligible.length);
  const chosen: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = eligible[n === 1 ? 0 : Math.round((i * (eligible.length - 1)) / (n - 1))].id;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return chosen.map((driveId, i) => ({ driveId, outcome: i % 2 === 0 ? 'score' : 'td' }));
}

/**
 * Pure: the football drive props for a game. The committed riverton game uses its hand-picked drives (output must stay
 * byte-identical to props.json); any other game gets auto-chosen picks unless `picks` is given.
 */
export function buildFootballProps(game: Game, picks?: Pick[]): Prop[] {
  const auto = picks === undefined && game.id !== FOOTBALL_GAME_ID;
  const list = picks ?? (auto ? autoFootballPicks(game) : FOOTBALL_PICKS);
  return list.map(({ driveId, outcome }, i) => {
    const start = game.events.find((e) => e.type === 'drive' && !e.driveResult && e.drive?.id === driveId);
    const end = game.events.find((e) => e.driveResult !== undefined && e.drive?.id === driveId);
    if (!start?.drive || !end) throw new Error(`drive ${driveId} not found in ${game.id}`);
    const drive: DriveState = start.drive;
    const nick = teamNickname(game, drive.team);
    const question =
      outcome === 'td' ? `Will the ${nick} get a touchdown on this drive?` : `Will the ${nick} score on this drive?`;
    return {
      id: `ff-${i + 1}`,
      gameId: game.id,
      question,
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      opensAt: start.t,
      locksAt: start.t + lockAfter(auto, start.t, end.t),
      resolvesAt: end.t,
      resolver: { kind: 'driveResult', driveId, outcome },
      source: 'fallback',
      odds: driveOddsProp(drive, outcome),
    } satisfies Prop;
  });
}

