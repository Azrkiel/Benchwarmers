import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SavedRooms } from './domain.js';
import { FOOTBALL_GAME_ID, getRoomSportAdapter } from './sports/index.js';
import { FOOTBALL_RULES_VERSION } from './sports/football.js';
import { pointsStateSchema } from './points/model.js';
import { pointsToUnits, validatePointsState,freeRewardUnits } from './points/ledger.js';
import { playerCallSchema } from './calls/model.js';
import type { PlayerCallDraft } from './calls/model.js';
import { canonicalTargetKey, canonicalTargetId } from './calls/catalog.js';
import { pregameSchema } from './pregame/model.js';
import { basketballEventSchema } from './basketball/events.js';
import { validateCorrectionState } from './corrections/service.js';

const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const id = z.string().min(1);
const stats = z.record(id, z.record(id, finite));
const lineup = z.object({ captainId: id, flexIds: z.array(id).length(4), salaryUsed: nonnegative.int() });
const pickScore = z.object({ points: nonnegative, base: nonnegative, factor: nonnegative, bonuses: z.array(z.string()), correct: z.boolean() });
const identity = z.object({ id, name: id, token: id });
const participant = identity.extend({ baseline: stats, lineup: lineup.optional(), predictionPoints: nonnegative, streak: nonnegative.int(), lastPickScore: pickScore.optional(),joinedSequence:nonnegative.int().optional() });
const target = z.object({templateId:z.enum(['next_score_team','next_made_field_goal_value','team_scores_in_window']),anchorSequence:nonnegative.int(),horizonGameElapsedMs:nonnegative,teamId:id.optional(),eligibleParticipantIds:z.array(id)});
const receipt = z.object({requestId:id,participantId:id,questionId:id,optionId:id,acceptedAt:finite,acceptanceSequence:nonnegative.int().positive()});
const question = z.object({
  view: z.object({ id, kind: id, text: id, opensAt: finite, locksAt: finite, remainingMs: nonnegative,
    options: z.array(z.object({ id, label: id, basePoints: nonnegative, probability: finite.min(0).max(1).optional() })).min(2),
    pickCounts: z.record(id, nonnegative.int()), status: z.enum(['open', 'locked', 'resolved', 'void']),
    result: z.object({ optionId: id, explanation: z.string() }).optional(),voidReason:id.optional(),target:target.optional() }),
  picks: z.record(id, z.object({ optionId: id, elapsedFraction: finite.min(0).max(1) })),
});
const legacyRoom = z.object({
  code: id, name: id, seasonId: id, hostToken: id, createdAt: finite,
  phase: z.enum(['lobby', 'live', 'paused', 'final']), speed: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  rules: z.object({ salaryCap: nonnegative.int(), flexSlots: z.literal(4), captainMultiplier: finite.positive(), positionMultipliers: z.record(id, finite.positive()), pickFactorCap: finite.positive() }),
  participants: z.array(participant), beatIndex: finite.int().min(-1), elapsedMs: nonnegative, durationMs: nonnegative,
  windowElapsedMs: nonnegative, lastTickAt: finite, stats, question: question.optional(), lastQuestion: question.optional(), recorded: z.boolean(),
});
const contributionRow=z.object({participantId:id,name:id,points:finite,fantasyPoints:finite,predictionPoints:nonnegative,nightsPlayed:z.literal(1),nightsWon:z.union([z.literal(0),z.literal(1)])}).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const correctionState=z.object({version:z.literal(1),revision:nonnegative.int().positive(),questions:z.array(z.object({question:question.extend({view:question.shape.view.strict()}).strict(),revision:nonnegative.int().positive(),correctionKey:id}).strict()).max(10000),seasonContribution:z.object({resultVersion:z.union([z.literal('original'),hash]),rows:z.array(contributionRow)}).strict().optional(),applied:z.array(z.object({resultVersion:hash,payloadHash:hash}).strict()).max(1000),score:z.record(id,nonnegative.int()).optional(),events:z.array(basketballEventSchema).max(100000).optional()}).strict();
const room = legacyRoom.extend({ gameId: id, rulesVersion: id, version: nonnegative.int().min(1), pickReceipts:z.array(receipt).optional(), points:pointsStateSchema.optional(), playerCalls:z.array(playerCallSchema).optional(), pregame:pregameSchema.optional(),correctionState:correctionState.optional() });
const season = z.object({ id, name: id, identities: z.array(identity), standings: z.array(z.object({
  participantId: id, name: id, points: finite, fantasyPoints: finite, predictionPoints: finite,
  nightsPlayed: nonnegative.int(), nightsWon: nonnegative.int(),
})) });
const v1 = z.object({ version: z.literal(1), rooms: z.array(legacyRoom), seasons: z.array(season) });
const v2 = z.object({ version: z.literal(2), rooms: z.array(room), seasons: z.array(season) });

function invalid(detail: string): never {
  throw new Error(`Invalid room data: ${detail}. Restore a valid backup; the existing file has not been replaced.`);
}
function unique(values: string[], description: string): void {
  if (new Set(values).size !== values.length) invalid(`duplicate ${description}`);
}

/** Validate structure and cross-record references before either migration or save. */
export function validateSavedRooms(input: unknown): SavedRooms {
  const parsed = v2.safeParse(input);
  if (!parsed.success) invalid(`validation failed at ${parsed.error.issues[0].path.join('.') || 'root'}`);
  const saved = parsed.data;
  unique(saved.rooms.map(r => r.code), 'room code');
  unique(saved.seasons.map(s => s.id), 'season ID');
  for (const s of saved.seasons) {
    unique(s.identities.map(i => i.id), 'season identity');
    unique(s.identities.map(i => i.token), 'season credential');
    unique(s.standings.map(row => row.participantId), 'season standing');
    if (s.standings.some(row => !s.identities.some(i => i.id === row.participantId) || row.nightsWon > row.nightsPlayed)) invalid('season standing references');
  }
  for (const r of saved.rooms) {
    const adapter = getRoomSportAdapter(r.gameId);
    if (!adapter || r.rulesVersion !== adapter.rulesVersion) invalid('unsupported room game or rules version');
    const s = saved.seasons.find(s => s.id === r.seasonId);
    if (!s) invalid('missing room season');
    if (r.beatIndex >= adapter.beats.length || r.elapsedMs > r.durationMs) invalid('replay position');
    if ((r.phase === 'lobby') !== (r.beatIndex === -1)) invalid('room phase and replay position');
    if (r.recorded !== (r.phase === 'final')) invalid('terminal season marker');
    unique(r.participants.map(p => p.id), 'participant');
    unique(r.participants.map(p => p.name.toLowerCase()), 'participant name');
    unique((r.pickReceipts??[]).map(receipt=>JSON.stringify([receipt.participantId,receipt.requestId])), 'pick receipt request');
    let previousAcceptance=0;
    for(const receipt of r.pickReceipts??[]){if(!r.participants.some(p=>p.id===receipt.participantId)||receipt.acceptanceSequence<=previousAcceptance)invalid('pick receipt references or ordering');previousAcceptance=receipt.acceptanceSequence;}
    if(r.pregame){
      const pregame=r.pregame,game=adapter.projectGame(r.beatIndex,r.phase),teamIds=[game.home.id,game.away.id];
      if(r.correctionState?.score){game.home.score=r.correctionState.score[game.home.id];game.away.score=r.correctionState.score[game.away.id];}
      if(adapter.sport!=='basketball'||(r.phase==='lobby')!==(pregame.status==='open')||(r.phase==='final')!==(pregame.status==='resolved'||pregame.status==='void'))invalid('pregame phase');
      if((pregame.status==='open')!==(pregame.lockedAt===undefined))invalid('pregame cutoff');
      if((pregame.status==='resolved')!==!!pregame.result||(pregame.status==='void')!==!!pregame.voidReason)invalid('pregame outcome');
      if(pregame.result&&(game.home.score===game.away.score||pregame.result.optionId!==(game.home.score>game.away.score?game.home.id:game.away.id)))invalid('pregame winner');
      if(pregame.status==='void'&&game.home.score!==game.away.score)invalid('pregame void');
      for(const [participantId,pick] of Object.entries(pregame.picks)){
        if(!r.participants.some(p=>p.id===participantId)||!teamIds.includes(pick.optionId)||(pregame.lockedAt!==undefined&&pick.acceptedAt>pregame.lockedAt))invalid('pregame pick');
        if(!(r.pickReceipts??[]).some(receipt=>receipt.participantId===participantId&&receipt.questionId===pregame.id&&receipt.optionId===pick.optionId&&receipt.acceptedAt===pick.acceptedAt))invalid('pregame pick receipt');
      }
      for(const p of r.participants){
        const correct=pregame.status==='resolved'&&pregame.picks[p.id]?.optionId===pregame.result!.optionId;
        if(correct&&p.predictionPoints<pregame.correctPoints)invalid('pregame reward');
        if(r.points){
          const reward=r.points.entries.find(entry=>entry.id===`reward:${JSON.stringify([p.id,pregame.id])}`);
          if(r.correctionState?.applied.length){if(freeRewardUnits(r.points,p.id,pregame.id)!==(correct?pregame.correctPoints*2:0))invalid('corrected pregame reward ledger');}
          else if(correct?(!reward||reward.units!==pregame.correctPoints*2||reward.reason!=='free_pick_reward'||reward.participantId!==p.id):!!reward)invalid('pregame reward ledger');
        }
      }
    }
    if(r.points){
      validatePointsState(r.points);
      for(const entry of r.points.entries.filter(entry=>entry.reason==='free_pick_correction')){
        if(!r.correctionState?.applied.some(applied=>applied.resultVersion===entry.resultVersion)||(entry.questionId!==r.pregame?.id&&!r.correctionState.questions.some(item=>item.question.view.id===entry.questionId)))invalid('correction posting reference');
      }
      for(const record of [...r.points.entries,...r.points.calls,...r.points.quotes,...r.points.pending])if(!r.participants.some(p=>p.id===record.participantId))invalid('points participant reference');
      for(const p of r.participants){
        if(!r.points.entries.some(entry=>entry.participantId===p.id&&entry.reason==='grant'))invalid('missing participant bank');
        const rewards=BigInt(freeRewardUnits(r.points,p.id));
        if(rewards!==BigInt(pointsToUnits(p.predictionPoints)))invalid('free reward ledger');
      }
    }
    unique((r.playerCalls??[]).map(call=>call.key),'player call target');
    unique((r.playerCalls??[]).map(call=>call.view.id),'player call ID');
    const hasCallDrafts=!!r.playerCalls?.length||r.points?.quotes.some(quote=>quote.playerCall);
    const windows=new Map((hasCallDrafts?adapter.beats:[]).flatMap(beat=>{
      if(!adapter.isWindow(beat))return [];
      const view=adapter.question(beat,0,adapter.duration(beat,r.speed));
      return view?.target?[[view.id,{target:view.target,minimum:(beat.gameElapsedMs??0)+1}] as const]:[];
    }));
    const validateDraft=(draft:PlayerCallDraft)=>{
      const window=windows.get(draft.windowQuestionId),target=draft.view.target;
      if(!window||window.target.anchorSequence!==target.anchorSequence||target.horizonGameElapsedMs<window.minimum||target.horizonGameElapsedMs>window.target.horizonGameElapsedMs)invalid('player call safe window');
      if(draft.key!==canonicalTargetKey(r.gameId,target)||draft.view.kind!==target.templateId)invalid('player call semantics');
      const expectedId=draft.key===canonicalTargetKey(r.gameId,window!.target)?draft.windowQuestionId:canonicalTargetId(draft.key);
      if(draft.view.id!==expectedId)invalid('player call identity');
      const game=adapter.projectGame(-1,'lobby');
      const options=target.templateId==='next_score_team'?[game.home.id,game.away.id]:['two','three'];
      if(JSON.stringify(draft.view.options.map(option=>option.id))!==JSON.stringify(options))invalid('player call options');
    };
    for(const call of r.playerCalls??[]){
      validateDraft(call);
      if(!r.points||adapter.sport!=='basketball'||!r.participants.some(p=>p.id===call.creatorId))invalid('player call owner');
      const accepted=r.points!.calls.find(accepted=>accepted.targetId===call.view.id&&accepted.participantId===call.creatorId&&accepted.acceptedAt===call.createdAt);
      if(!accepted||r.points!.quotes.find(quote=>quote.quoteId===accepted.quoteId)?.playerCall?.key!==call.key)invalid('uncommitted player call');
      const terminal=call.view.status==='resolved'||call.view.status==='void';
      if((call.view.status==='resolved')!==!!call.view.result||(call.view.status==='void')!==!!call.view.voidReason)invalid('player call outcome');
      for(const accepted of r.points!.calls.filter(accepted=>accepted.targetId===call.view.id)){
        if(terminal!==(accepted.state!=='pending'))invalid('player call settlement');
        if(call.view.result&&accepted.outcomeKey!==JSON.stringify(['result',call.view.result.optionId]))invalid('player call result');
      }
    }
    for(const quote of r.points?.quotes??[]){
      const draft=quote.playerCall;if(!draft)continue;
      validateDraft(draft);
      if(draft.key!==canonicalTargetKey(r.gameId,draft.view.target)||quote.targetId!==draft.view.id||quote.questionId!==draft.view.id||!draft.view.options.some(o=>o.id===quote.optionId)||draft.view.target.eligibleParticipantIds.some(id=>!r.participants.some(p=>p.id===id)))invalid('player call draft');
    }
    for (const p of r.participants) {
      if (!s.identities.some(i => i.id === p.id && i.token === p.token && i.name === p.name)) invalid('participant identity');
      if (p.lineup) {
        const ids = [p.lineup.captainId, ...p.lineup.flexIds];
        unique(ids, 'lineup player');
        if (ids.some(id => !Object.hasOwn(adapter.playerById, id))) invalid('lineup player');
        const cost = Math.round(adapter.playerById[ids[0]].salary * r.rules.captainMultiplier) + ids.slice(1).reduce((sum, id) => sum + adapter.playerById[id].salary, 0);
        if (p.lineup.salaryUsed !== cost || cost > r.rules.salaryCap) invalid('lineup salary');
      }
    }
    for (const q of [r.question, r.lastQuestion,...(r.correctionState?.questions??[]).map(item=>item.question),...(r.playerCalls??[]).map(call=>({view:call.view,picks:{}}))]) {
      if (!q) continue;
      unique(q.view.options.map(o => o.id), 'question option');
      if ((q.view.status === 'resolved') !== Boolean(q.view.result)) invalid('question result status');
      if ((q.view.status === 'void') !== Boolean(q.view.voidReason)) invalid('question void status');
      if(q.view.target){unique(q.view.target.eligibleParticipantIds,'eligible participant');if(q.view.target.eligibleParticipantIds.some(id=>!r.participants.some(p=>p.id===id)))invalid('target eligibility');}
      if (q.view.result && !q.view.options.some(o => o.id === q.view.result!.optionId)) invalid('question result option');
      for (const [participantId, pick] of Object.entries(q.picks)) {
        if (!r.participants.some(p => p.id === participantId) || !q.view.options.some(o => o.id === pick.optionId) || (q.view.target&&!q.view.target.eligibleParticipantIds.includes(participantId))) invalid('question pick');
      }
    }
    validateCorrectionState(r,adapter);
  }
  return saved;
}

/** A private, flushed temporary file is renamed only after the full write succeeds. */
export function writeSavedRooms(dataFile: string, saved: SavedRooms): void {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temp = `${dataFile}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(saved)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp, dataFile);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function loadSavedRooms(dataFile: string): SavedRooms | undefined {
  if (!fs.existsSync(dataFile)) return;
  const original = fs.readFileSync(dataFile, 'utf8');
  let input: unknown;
  try { input = JSON.parse(original); } catch { invalid('JSON validation failed'); }
  if (!input || typeof input !== 'object' || !('version' in input)) invalid('missing file version');
  if (input.version === 2) return validateSavedRooms(input);
  if (input.version !== 1) throw new Error(`Unsupported room data version ${String(input.version)}. Use a compatible server or restore a supported backup. The file was not changed.`);
  const legacy = v1.safeParse(input);
  if (!legacy.success) invalid(`validation failed at ${legacy.error.issues[0].path.join('.') || 'root'}`);
  const saved = validateSavedRooms({ version: 2, seasons: legacy.data.seasons, rooms: legacy.data.rooms.map(r => ({ ...r, gameId: FOOTBALL_GAME_ID, rulesVersion: FOOTBALL_RULES_VERSION, version: 1 })) });
  const backup = `${dataFile}.v1.bak`;
  if (fs.existsSync(backup)) {
    if (fs.readFileSync(backup, 'utf8') !== original) throw new Error(`Room data migration backup already exists with different contents: ${backup}. Preserve both files before retrying.`);
  } else {
    const fd = fs.openSync(backup, 'wx', 0o600);
    try { fs.writeFileSync(fd, original); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  writeSavedRooms(dataFile, saved);
  return saved;
}
