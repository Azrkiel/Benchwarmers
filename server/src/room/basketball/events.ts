import { z } from 'zod';

export const basketballStat = z.enum(['pts2', 'pts3', 'ft', 'reb', 'ast', 'stl', 'blk', 'tov']);
export const basketballEventSchema = z.object({
  id: z.string().min(1), revision: z.number().int().positive(), sequence: z.number().int().positive(),
  gameId: z.string().min(1), gameElapsedMs: z.number().finite().nonnegative(),
  occurredAt: z.number().finite().nonnegative(), receivedAt: z.number().finite().nonnegative(),
  kind: z.enum(['possession', 'shot_attempt', 'score', 'stat', 'period', 'final']),
  teamId: z.string().min(1).optional(), playerId: z.string().min(1).optional(),
  scoreValue: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  shotType: z.enum(['free_throw', 'layup', 'dunk', 'jump_shot', 'three_pointer']).optional(),
  statDeltas: z.partialRecord(basketballStat, z.number().int().nonnegative()).optional(),
}).strict();
export type BasketballEvent = z.infer<typeof basketballEventSchema>;
export type BasketballCatalog = { gameId: string; teamIds: readonly string[]; playerTeams: Readonly<Record<string, string>> };

/** Validate at the reducer boundary too; serialized input is never trusted. */
export function validateBasketballEvent(input: unknown, catalog: BasketballCatalog): BasketballEvent {
  const event = basketballEventSchema.parse(input);
  const reject = (reason: string): never => { throw new Error(`Invalid basketball event ${event.id}: ${reason}`); };
  if (event.gameId !== catalog.gameId) reject('game ID');
  if (event.teamId !== undefined && !catalog.teamIds.includes(event.teamId)) reject('unknown team');
  if (event.playerId !== undefined && (!Object.hasOwn(catalog.playerTeams, event.playerId) || catalog.playerTeams[event.playerId] !== event.teamId)) reject('player/team reference');
  if (['score', 'stat', 'shot_attempt'].includes(event.kind) && (!event.teamId || !event.playerId)) reject('team and player required');
  if (event.kind === 'possession' && !event.teamId) reject('possession team required');
  if (event.kind === 'shot_attempt' && !event.shotType) reject('attempt subtype required');
  if (event.kind !== 'score' && event.scoreValue !== undefined) reject('only scores change team points');
  if (!['score', 'stat'].includes(event.kind) && event.statDeltas !== undefined) reject('unexpected stat deltas');
  if (!['score', 'shot_attempt'].includes(event.kind) && event.shotType !== undefined) reject('unexpected shot subtype');
  const scoringStats = ['pts2', 'pts3', 'ft'] as const;
  if (event.kind === 'score') {
    if (!event.scoreValue) reject('score value required');
    const stat = event.scoreValue === 1 ? 'ft' : event.scoreValue === 2 ? 'pts2' : 'pts3';
    if (event.statDeltas?.[stat] !== 1 || Object.entries(event.statDeltas).some(([key, n]) => key !== stat && n !== 0)) reject('one matching scorer credit required');
    if (event.shotType && (event.scoreValue === 1 ? event.shotType !== 'free_throw' : event.scoreValue === 3 ? event.shotType !== 'three_pointer' : !['layup', 'dunk', 'jump_shot'].includes(event.shotType))) reject('score/subtype mismatch');
  }
  if (event.kind === 'stat' && (!event.statDeltas || !Object.values(event.statDeltas).some(n => n! > 0) || scoringStats.some(key => (event.statDeltas?.[key] ?? 0) !== 0))) reject('non-scoring stat credit required');
  return event;
}
