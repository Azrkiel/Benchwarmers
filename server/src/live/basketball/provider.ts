import type { BasketballCatalog, BasketballEvent } from '../../room/basketball/events.js';

/** Internal adapter boundary. No real provider or live room is enabled by this contract. */
export type ProviderCapabilities={teamPossession:boolean;playerPossession:boolean;continuousBall:boolean;timestampPrecisionMs:number|null;preActionSuspensionVerified:boolean};
export type ProviderGame={providerGameId:string;leagueId:string;homeTeamId:string;awayTeamId:string;scheduledAt:number};
export type ProviderSnapshot={game:ProviderGame;cursor:string;events:unknown[];reconciled:boolean};
export interface BasketballProvider {
  readonly name:string;
  readonly capabilities:ProviderCapabilities;
  discover(signal:AbortSignal):Promise<ProviderGame[]>;
  snapshot(providerGameId:string,signal:AbortSignal):Promise<ProviderSnapshot>;
  poll(providerGameId:string,cursor:string,signal:AbortSignal):Promise<{cursor:string;events:unknown[];heartbeatAt:number;authoritative?:boolean}>;
}
export type ProviderMapping={provider:string;gameId:string;catalog:BasketballCatalog;teams:Readonly<Record<string,string>>;players:Readonly<Record<string,string>>};
export type NormalizedProviderEvent={provider:string;providerEventId:string;revision:number;rawPayloadRef?:string;event:BasketballEvent};
