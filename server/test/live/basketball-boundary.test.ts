import { expect,it } from 'vitest';
import { normalizeProviderEvent } from '../../src/live/basketball/normalize.js';
import { sourceHealth } from '../../src/live/basketball/freshness.js';

// Synthetic boundary input. This is not a captured or validated Sportradar payload.
const input={provider:'synthetic',gameId:'external-game',eventId:'external-1',revision:1,sequence:1,gameElapsedMs:1000,occurredAt:1000,receivedAt:1100,
  kind:'score',teamId:'external-home',playerId:'external-player',scoreValue:2,statDeltas:{pts2:1}};
const mapping={provider:'synthetic',gameId:'external-game',catalog:{gameId:'fixture-game',teamIds:['home','away'],playerTeams:{scorer:'home'}},teams:{'external-home':'home','external-away':'away'},players:{'external-player':'scorer'}};
it('normalizes explicit identities and retains provider identity and revision for later reconciliation',()=>{
  expect(normalizeProviderEvent(input,mapping)).toMatchObject({provider:'synthetic',providerEventId:'external-1',revision:1,event:{gameId:'fixture-game',teamId:'home',playerId:'scorer',kind:'score',scoreValue:2,sequence:1,occurredAt:1000,receivedAt:1100}});
});
it('rejects unmapped/mismatched identities, invalid scores and unsupported fields',()=>{
  for(const patch of [{gameId:'another-game'},{provider:'other'},{teamId:'unknown'},{playerId:'unknown'},{scoreValue:4},{statDeltas:{pts3:1}},{futureResult:'home'},{teamId:'external-away'},{sequence:1.5}]){
    expect(()=>normalizeProviderEvent({...input,...patch},mapping)).toThrow();
  }
});
it('does not fabricate player possession or ball observations from a scorer',()=>{
  const normalized=normalizeProviderEvent(input,mapping);
  expect(normalized.event).not.toHaveProperty('ball');expect(normalized.event.kind).toBe('score');
  expect(normalized.event).not.toHaveProperty('possessionPlayerId');
});
it('uses heartbeat freshness rather than requiring a score during a quiet game',()=>{
  expect(sourceHealth({now:10000,lastHeartbeatAt:9000,reconciled:true})).toMatchObject({status:'healthy',microPredictionsEnabled:false});
  expect(sourceHealth({now:10000,lastHeartbeatAt:7000,reconciled:true}).status).toBe('delayed');
  expect(sourceHealth({now:10000,lastHeartbeatAt:0,reconciled:true}).status).toBe('stale');
  expect(sourceHealth({now:10000,lastHeartbeatAt:null,reconciled:false}).status).toBe('unavailable');
});
it('closes the source gate immediately for a gap, unsupported input or unreconciled reconnect',()=>{
  for(const patch of [{gap:true},{unsupported:true},{reconciled:false},{lastHeartbeatAt:11000}]){
    expect(sourceHealth({now:10000,lastHeartbeatAt:9000,reconciled:true,...patch})).toMatchObject({status:'unavailable',microPredictionsEnabled:false});
  }
});
