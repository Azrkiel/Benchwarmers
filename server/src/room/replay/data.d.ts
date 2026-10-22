export type ReplayPlayer = {id:string;name:string;team:string;pos:string;role:string;salary:number};
export const PLAYERS: ReplayPlayer[];
export const PLAYER_BY_ID: Record<string,ReplayPlayer>;
export const TEAMS: Record<string,{id:string;name:string;city:string;full:string;color:string;accent:string}>;
export const LINEUP_RULES: {salaryCap:number;flexSlots:number;captainMultiplier:number};
export const PREDICTION_POINTS: Record<string,number>;
export const PREDICTION_LABELS: Record<string,string>;
