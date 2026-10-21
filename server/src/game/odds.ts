// Typed lookup into the committed drive_odds.json (historical drive outcomes by field position and clock state). Reads via fs so it works under tsx and vitest alike.
import fs from 'node:fs';
import type { DriveState, PropOdds } from '../shared/types.js';

type OddsRow = { p_score: number; p_td: number; n: number };

type Band = { lo: number; hi: number; clock: 'normal' | 'two-minute'; key: string; row: OddsRow };

const RAW = JSON.parse(fs.readFileSync(new URL('./odds/drive_odds.json', import.meta.url), 'utf8')) as Record<string, OddsRow>;

const BANDS: Band[] = Object.entries(RAW).map(([key, row]) => {
  const m = /^(\d+)-(\d+)\|(normal|two-minute)$/.exec(key);
  if (!m) throw new Error(`drive_odds.json: bad bucket key "${key}"`);
  return { lo: Number(m[1]), hi: Number(m[2]), clock: m[3] as Band['clock'], key, row };
});

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Probability that a drive starting here ends in a score (any) or a touchdown, with the bucket it came from. */
export function getOdds(
  yardline100: number,
  halfSecondsRemaining: number,
  type: 'score' | 'td',
): { p: number; bucket: string; n: number } {
  const yl = Math.min(99, Math.max(1, Math.round(yardline100)));
  const clock = halfSecondsRemaining < 120 ? 'two-minute' : 'normal';
  const band = BANDS.find((b) => b.clock === clock && yl >= b.lo && yl <= b.hi);
  if (!band) throw new Error(`no drive_odds bucket for yardline ${yl} (${clock})`);
  return { p: type === 'score' ? band.row.p_score : band.row.p_td, bucket: band.key, n: band.row.n };
}

/** PropOdds for a yes/no drive prop; yes + no is exactly 1 after 3-decimal rounding. */
export function driveOddsProp(drive: DriveState, outcome: 'score' | 'td'): PropOdds {
  const { p, bucket, n } = getOdds(drive.yardline100, drive.halfSecondsRemaining, outcome);
  const yes = round3(p);
  return { source: 'drive_odds', bucket, n, p: { yes, no: round3(1 - yes) } };
}
