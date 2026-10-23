/** Public game-point contracts. Monetary salary and fantasy production are not spendable bank points. */
export type CallBank = { grantPoints:number; availablePoints:number; reservedPoints:number; settledRiskNet:number; correctionDebt:number };
export type CommitmentQuote = { quoteId:string; targetId:string; targetVersion:string; maximumLossPoints:number; probabilityVersion:string; probabilitySource:string; questionId:string; optionId:string; optionLabel:string; commitPoints:number; totalReturnPoints:number; multiplier:number; probabilityLabel:string; firstCaller:boolean; expiresAt:number };
export type CommitmentReceipt = { callId:string; requestId:string; quoteId:string; questionId:string; optionId:string; optionLabel:string; commitPoints:number; totalReturnPoints:number; acceptedAt:number; acceptedSequence:number; state:'pending'|'won'|'lost'|'void' };
export type ProbabilityEstimate = { p:number; version:string; label:string; source:string; observedAt:number; validUntil:number };
