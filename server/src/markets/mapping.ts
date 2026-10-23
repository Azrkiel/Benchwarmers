import type {MarketGameIdentity,MarketSnapshot,VerifiedMarketMapping} from './types.js';
export const normalizeMarketLabel=(value:string)=>value.trim().toLowerCase().replace(/\s+/g,' ');
const normalize=normalizeMarketLabel;
/** Exact reviewed provider question/rules plus canonical team names. No fuzzy team aliases. */
export function validateMarketMapping(game:MarketGameIdentity,mapping:VerifiedMarketMapping,market:MarketSnapshot):boolean {
 const start=Date.parse(game.scheduledStart),date=game.scheduledStart.slice(0,10);
 if(game.fictional||!Number.isFinite(start)||!Number.isFinite(Date.parse(mapping.reviewedAt)))return false;
 if(mapping.gameId!==game.gameId||mapping.league!==game.league||mapping.homeTeamId!==game.home.id||mapping.awayTeamId!==game.away.id||game.home.id===game.away.id)return false;
 if(Date.parse(mapping.scheduledStart)!==start||Date.parse(market.scheduledStart)!==start)return false;
 if(market.marketId!==mapping.marketId||market.slug!==mapping.marketSlug||market.question!==mapping.question||market.description!==mapping.reviewedDescription)return false;
 const question=normalize(market.question),description=normalize(market.description);
 if(/\b(series|spread|handicap|total|over\/under|regulation)\b/.test(question)||!question.includes('winner'))return false;
 if(!question.includes(normalize(game.league))||!question.includes(date)||!question.includes(normalize(game.home.name))||!question.includes(normalize(game.away.name)))return false;
 if(!description.includes(date)||!description.includes(normalize(game.league))||!description.includes(normalize(game.home.name))||!description.includes(normalize(game.away.name)))return false;
 if(mapping.settlement.kind!=='game_winner'||mapping.settlement.includesOvertime!==true||mapping.settlement.postponed!=='void'||mapping.settlement.abandoned!=='void')return false;
 if(normalize(mapping.homeOutcome)!==normalize(game.home.name)||normalize(mapping.awayOutcome)!==normalize(game.away.name)||normalize(game.home.name)===normalize(game.away.name))return false;
 const labels=market.outcomes.map(outcome=>normalize(outcome.label));
 return labels.length===2&&new Set(labels).size===2&&labels.includes(normalize(mapping.homeOutcome))&&labels.includes(normalize(mapping.awayOutcome));
}
