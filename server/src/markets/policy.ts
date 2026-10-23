import type { PregameReference } from '../shared/pregame.js';

/** No provider request in a room read, and no implied market for an unmapped game. */
export function unavailablePregameReference(fictional:boolean):PregameReference {
  return {status:'unavailable',reason:fictional?'fictional_game':'unmapped_game',
    label:fictional?'No external market reference for this fictional matchup.':'No verified market mapping is available for this game.',
    reference:null,commitmentQuotingEnabled:false};
}
