import type { SourceStatus } from '../../shared/room.js';
export type HealthInput={now:number;lastHeartbeatAt:number|null;reconciled:boolean;gap?:boolean;unsupported?:boolean};
export type SourceHealth={status:SourceStatus;lastHeartbeatAt:number|null;microPredictionsEnabled:false};

/** Proposed 3/10-second defaults, not measured provider latency or a safe action window. */
export function sourceHealth(input:HealthInput):SourceHealth {
  const {now,lastHeartbeatAt}=input;
  let status:SourceStatus='unavailable';
  if(Number.isFinite(now)&&now>=0&&lastHeartbeatAt!==null&&Number.isFinite(lastHeartbeatAt)&&lastHeartbeatAt>=0&&lastHeartbeatAt<=now&&input.reconciled&&!input.gap&&!input.unsupported){
    const elapsed=now-lastHeartbeatAt;status=elapsed>=10000?'stale':elapsed>=3000?'delayed':'healthy';
  }
  return {status,lastHeartbeatAt:!Number.isFinite(lastHeartbeatAt)?null:lastHeartbeatAt,microPredictionsEnabled:false};
}
