import type { DraftBoardEntry, PartyStateResponse } from '@shared/types';

/**
 * Lowest-scoring drafted player across all rosters. Ties: the later row in standings order
 * (then roster order) loses, so the result is deterministic.
 */
export function worstPerformer(
  state: PartyStateResponse,
): { memberId: string; playerId: string; points: number } | undefined {
  let worst: { memberId: string; playerId: string; points: number } | undefined;
  for (const s of state.standings) {
    for (const r of s.roster) {
      if (!worst || r.points <= worst.points) worst = { memberId: s.memberId, playerId: r.playerId, points: r.points };
    }
  }
  return worst;
}

export function playerInfo(state: PartyStateResponse, playerId: string): DraftBoardEntry | undefined {
  return state.draftBoard.find((e) => e.player.id === playerId);
}
