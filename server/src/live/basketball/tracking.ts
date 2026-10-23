export type TrackingObservation={x:number;y:number;observedAt:number;receivedAt:number;confidence:number;source:string;inPlay:boolean};
export type CourtGeometry={length:number;width:number;reverse:boolean|null};
export type TrackingPoint={status:'unknown'}|{status:'observed';x:number;y:number;observedAt:number;receivedAt:number;confidence:number;source:string};
/** Only genuine time-series observations enter here. Shot locations are not ball tracking. */
export function normalizeTrackingPoint(observation:TrackingObservation|null,geometry:CourtGeometry,now:number,maxAgeMs:number):TrackingPoint{
 if(!observation||geometry.reverse===null||!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<0||![geometry.length,geometry.width].every(n=>Number.isFinite(n)&&n>0))return {status:'unknown'};
 const {x,y,observedAt,receivedAt,confidence,source,inPlay}=observation;
 if(![x,y,observedAt,receivedAt,confidence].every(Number.isFinite)||!source||!inPlay||observedAt<0||observedAt>receivedAt||receivedAt>now||now-observedAt>maxAgeMs||confidence<0||confidence>1||x<0||x>geometry.length||y<0||y>geometry.width)return {status:'unknown'};
 return {status:'observed',x:geometry.reverse?1-x/geometry.length:x/geometry.length,y:geometry.reverse?1-y/geometry.width:y/geometry.width,observedAt,receivedAt,confidence,source};
}
