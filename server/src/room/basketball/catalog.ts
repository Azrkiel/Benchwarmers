import source from '../../game/games/harbor-vs-summit.json' with { type: 'json' };
import { BASKETBALL_STATS, FANTASY_SCORING } from '../../shared/types.js';
import type { RoomRules } from '../types.js';

export const BASKETBALL_RULES_VERSION = 'basketball-v1';
export const SALARY_MODEL_VERSION = 'demo-projection-350-v1';
// Authored pregame inputs. These deliberately do not use source.events or final statistics.
const projections: Record<string, number> = {
  'har-pg-1': 32, 'har-sg-7': 30, 'har-sf-11': 25, 'har-pf-21': 24,
  'har-c-34': 22, 'har-pg-5': 20, 'har-sf-23': 18, 'har-c-44': 15,
  'sum-pg-2': 33, 'sum-sg-10': 28, 'sum-sf-14': 26, 'sum-pf-32': 23,
  'sum-c-50': 22, 'sum-sg-4': 19, 'sum-pf-15': 17, 'sum-sf-8': 16,
};
export const basketballRules: RoomRules = { salaryCap: 50000, flexSlots: 4, captainMultiplier: 1.5,
  positionMultipliers: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1 }, pickFactorCap: 5 };
export function salaryFor(projectedPoints: number): number {
  if (!Number.isFinite(projectedPoints) || projectedPoints < 0) throw new Error('INVALID_PROJECTION');
  return Math.round(Math.max(3500, Math.min(11500, projectedPoints * 350)) / 500) * 500;
}
export const basketballPlayers = [...source.home.roster, ...source.away.roster].map(player => ({
  id: player.id, name: player.name, ...(player.nickname ? { nickname: player.nickname } : {}), team: player.teamId, pos: player.position, role: player.position,
  projectedPoints: projections[player.id], projectionSource: 'demo_projection' as const,
  salaryModelVersion: SALARY_MODEL_VERSION, salary: salaryFor(projections[player.id]),
}));
export function basketballRawPoints(stats: Record<string, number>): number {
  return BASKETBALL_STATS.reduce((total, key) => total + (stats[key] ?? 0) * FANTASY_SCORING[key], 0);
}

const autoCache = new Map<string, readonly string[]>();
/** Exhaustive search is small for 16 players. Only pregame projections and salaries are inputs. */
export function basketballAutoLineup(style: 'balanced'|'stars'|'value'): readonly string[] {
  const cached = autoCache.get(style); if (cached) return cached;
  const players = [...basketballPlayers].sort((a,b) => a.id.localeCompare(b.id));
  let best: string[] = [], bestScore = -Infinity;
  for (const captain of players) {
    const flex = players.filter(p => p.id !== captain.id);
    const search = (start: number, chosen: typeof players, cost: number) => {
      if (cost > basketballRules.salaryCap) return;
      if (chosen.length === 4) {
        const projection = captain.projectedPoints * 1.5 + chosen.reduce((n,p) => n + p.projectedPoints, 0);
        const diversity = new Set([captain, ...chosen].map(p => p.pos)).size;
        const score = style === 'balanced' ? projection + diversity * 3 : style === 'value' ? projection / cost * 10000 : projection;
        // Enumeration order is the stable ID tie-break.
        if (score > bestScore) { bestScore = score; best = [captain.id, ...chosen.map(p => p.id)]; }
        return;
      }
      for (let i = start; i < flex.length; i++) search(i + 1, [...chosen, flex[i]], cost + flex[i].salary);
    };
    search(0, [], Math.round(captain.salary * 1.5));
  }
  if (best.length !== 5) throw new Error('No affordable basketball lineup');
  const result = Object.freeze(best); autoCache.set(style, result); return result;
}
