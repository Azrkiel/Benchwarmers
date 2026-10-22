export type Beat = {i:number;type:string;drive:number;q:number;clock:string;off:string;ballOn:number;down:number;togo:number;fieldX:number;deltas:[string,string,number][];kind:string;text:string;score:Record<string,number>;situation?:string;outcome?:string};
export function buildTimeline(): {beats:Beat[];warnings:string[];driveCount:number};
export function toSec(clock:string):number;
