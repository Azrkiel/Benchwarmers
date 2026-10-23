export type PregamePickInput={participantToken:string;requestId:string;optionId:string};
export type PregameView={
  id:string;status:'open'|'locked'|'resolved'|'void';acceptingPicks:boolean;
  text:string;options:{id:string;label:string}[];pickCounts:Record<string,number>;
  cutoff:'replay_start';lockedAt?:number;correctPoints:10;resolutionRule:string;
  result?:{optionId:string;explanation:string};voidReason?:string;
};
export type PregameReference=import('../markets/types.js').MarketReferenceView;
