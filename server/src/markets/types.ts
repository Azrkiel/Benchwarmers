/** Operator-reviewed identity, never inferred from a search result. No mappings ship enabled. */
export type MarketGameIdentity={gameId:string;fictional:boolean;league:string;scheduledStart:string;home:{id:string;name:string};away:{id:string;name:string}};
export type VerifiedMarketMapping={gameId:string;league:string;homeTeamId:string;awayTeamId:string;scheduledStart:string;marketId:string;marketSlug:string;question:string;homeOutcome:string;awayOutcome:string;reviewedDescription:string;reviewedAt:string;settlement:{kind:'game_winner';includesOvertime:boolean;postponed:'void';abandoned:'void'}};
export type MarketSnapshot={provider:'polymarket';marketId:string;slug:string;question:string;description:string;scheduledStart:string;observedAt:number;active:boolean;closed:boolean;archived:boolean;outcomes:{label:string;price:number}[];bestBid:number;bestAsk:number};
export interface ReadOnlyMarketAdapter{fetchMarket(marketId:string):Promise<MarketSnapshot>}
export type MarketReference={provider:'polymarket';marketId:string;sourceUrl:string;observedAt:number;freshnessMs:number;priceMethod:'gamma_outcome_prices';bestBid:number;bestAsk:number;outcomes:{teamId:string;label:string;price:number}[]};
export type MarketUnavailableReason='fictional_game'|'unmapped_game'|'mapping_mismatch'|'wide_spread'|'invalid_source'|'source_unavailable'|'market_closed';
export type MarketReferenceView=({status:'unavailable';reason:MarketUnavailableReason;reference:null}|{status:'available'|'stale';reference:MarketReference})&{label:string;commitmentQuotingEnabled:false};
