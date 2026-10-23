import { basketballAutoLineup, basketballPlayers, basketballRules, SALARY_MODEL_VERSION } from './catalog.js';

/** Offline inspection of authored pregame inputs, not evidence of real positional equivalence. */
export function basketballCalibrationReport() {
  const positions = Object.entries(basketballRules.positionMultipliers).map(([position, weight]) => {
    const players = basketballPlayers.filter(p => p.pos === position);
    const expectedRaw = players.reduce((sum, p) => sum + p.projectedPoints, 0) / players.length;
    return { position, players: players.length, weight, expectedRaw, expectedWeighted: expectedRaw * weight };
  });
  const lineups = (['balanced', 'stars', 'value'] as const).map(style => {
    const ids = basketballAutoLineup(style);
    const players = ids.map(id => basketballPlayers.find(p => p.id === id)!);
    return { style, ids, salaryUsed: players.reduce((sum, p, i) => sum + p.salary * (i === 0 ? 1.5 : 1), 0),
      expectedPoints: players.reduce((sum, p, i) => sum + p.projectedPoints * (i === 0 ? 1.5 : 1), 0) };
  });
  return { provenance: 'demo_projection' as const, calibrated: false as const, salaryModelVersion: SALARY_MODEL_VERSION, positions, lineups };
}
