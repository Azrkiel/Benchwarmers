export type TeamScoringWindow={teamId:string;acceptedAt:number;closesAt:number;startsAt:number;endsAt:number;guardMs:number};
export type WindowEvent={kind:string;teamId?:string;scoreValue?:number;occurredAt:number;receivedAt:number};
export type WindowHealth={now:number;watermarkAt:number;precisionMs:number|null;reconciled:boolean;gap:boolean};
export type WindowResult={status:'pending'}|{status:'resolved';scored:boolean}|{status:'void';reason:string};
/** Half-open [startsAt,endsAt) in real milliseconds. Watermark must be provider-confirmed coverage, never just a heartbeat. */
export function resolveTeamScoringWindow(target:TeamScoringWindow,events:readonly WindowEvent[],health:WindowHealth):WindowResult{
 const voided=(reason:string):WindowResult=>({status:'void',reason});
 const {precisionMs:p}=health;
 if(p===null||!Number.isFinite(p)||p<0||!health.reconciled||health.gap)return voided('Untrusted source timing');
 if(!target.teamId||![target.acceptedAt,target.closesAt,target.startsAt,target.endsAt,target.guardMs,health.now,health.watermarkAt].every(n=>Number.isFinite(n)&&n>=0)||target.acceptedAt>=target.closesAt||target.endsAt<=target.startsAt||target.guardMs<p||target.startsAt-target.closesAt<target.guardMs||health.watermarkAt>health.now)return voided('Unsafe target timing');
 let scored=false;
 for(const event of events){
  if(event.kind!=='score'||event.teamId!==target.teamId)continue;
  if(![event.occurredAt,event.receivedAt].every(n=>Number.isFinite(n)&&n>=0)||![1,2,3].includes(event.scoreValue??0))return voided('Invalid score timing');
  if(event.receivedAt>target.acceptedAt&&event.occurredAt-p<=target.acceptedAt)return voided('Late action predates acceptance');
  if(p>0&&[target.startsAt,target.endsAt].some(boundary=>event.occurredAt-p<=boundary&&event.occurredAt+p>=boundary))return voided('Timestamp overlaps interval boundary');
  if(event.occurredAt>=target.startsAt&&event.occurredAt<target.endsAt)scored=true;
 }
 if(health.now<target.endsAt+p||health.watermarkAt<target.endsAt+p)return {status:'pending'};
 return {status:'resolved',scored};
}
