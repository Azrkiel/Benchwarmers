import type {QuestionState} from '../domain.js';
import type {RoomSeasonStanding} from '../types.js';
import type {BasketballEvent} from '../basketball/events.js';
/** Present only for newly opted-in rooms; absent history is never inferred from final totals. */
export type CorrectionState={version:1;revision:number;questions:{question:QuestionState;revision:number;correctionKey:string}[];seasonContribution?:{resultVersion:string;rows:RoomSeasonStanding[]};applied:{resultVersion:string;payloadHash:string}[];score?:Record<string,number>;events?:BasketballEvent[]};
