import {expect,it} from 'vitest';
import {evaluateCalibration,type CalibrationInput} from '../../src/live/basketball/calibration.js';
const positions=['PG','SG','SF','PF','C'] as const;
const records=positions.flatMap((position,i)=>[10,20,110,120].map((occurredAt,j)=>({playerId:`p${i}`,gameId:`g${j}`,position,occurredAt,availableAt:occurredAt+1,minutes:30,stats:{pts2:10+i}})));
const input:CalibrationInput={source:{kind:'synthetic',datasetId:'synthetic-only',authorized:true},training:{startsAt:0,endsAt:100},heldout:{startsAt:100,endsAt:200},minimumSamples:2,records,currentRulesVersion:'rules-1',currentCatalogVersion:'catalog-1',candidateRulesVersion:'rules-2',candidateCatalogVersion:'catalog-2',pregamePlayers:positions.map((position,i)=>({id:`p${i}`,position,rawProjection:20+i}))};
it('learns bounded training-only weights, verifies later holdout, and counts affordable distinct captain lineups',()=>{
 const report=evaluateCalibration(input);
 expect(report.validationPassed).toBe(true);expect(report.positions.PG.trainingCount).toBe(2);expect(report.positions.C.heldoutCount).toBe(2);expect(report.proposedWeights.PG).toBeCloseTo(1.2);expect(report.proposedWeights.C).toBeCloseTo(24/28);expect(report.affordableDistinctCaptainLineups).toBeGreaterThanOrEqual(3);
 expect(report.adoptionEligible).toBe(false);expect(Object.values(report.weights)).toEqual([1,1,1,1,1]);expect(report.minutesTreatment).toBe('observed_game_totals_no_imputation');
});
it('does not leak heldout values into training and falls back to neutral after failed holdout',()=>{
 const changed=structuredClone(input);changed.records=changed.records.map(row=>row.occurredAt>=100&&row.position==='PG'?{...row,stats:{pts2:100}}:row);
 const report=evaluateCalibration(changed);expect(report.proposedWeights).toEqual(evaluateCalibration(input).proposedWeights);expect(report.validationPassed).toBe(false);expect(Object.values(report.weights)).toEqual([1,1,1,1,1]);
});
it('excludes missing positions, invalid stats/minutes, duplicate player-games and late available training records',()=>{
 const changed=structuredClone(input);changed.records=[...changed.records,{...changed.records[0],position:null},{...changed.records[0],gameId:'badstats',stats:{pts2:-1}},{...changed.records[0],gameId:'badminutes',minutes:NaN},{...changed.records[0],gameId:'late',availableAt:150},changed.records[0]];
 const report=evaluateCalibration(changed);expect(report.excludedRecords).toBe(5);expect(report.positions.PG.trainingCount).toBe(2);expect(report.validationPassed).toBe(false);
});
it('requires nonoverlapping chronology, enough all-position samples and three affordable captains',()=>{
 expect(evaluateCalibration({...input,heldout:{startsAt:50,endsAt:200}}).validationPassed).toBe(false);
 expect(evaluateCalibration({...input,minimumSamples:3}).validationPassed).toBe(false);
 expect(evaluateCalibration({...input,pregamePlayers:input.pregamePlayers.slice(0,4)}).validationPassed).toBe(false);
});
it('requires authorized historical provenance and new catalog/rules versions for proposed adoption, without mutation',()=>{
 const historical={...input,source:{kind:'authorized_history' as const,datasetId:'declared-history',authorized:true}};const before=structuredClone(historical);
 expect(evaluateCalibration(historical).adoptionEligible).toBe(true);expect(historical).toEqual(before);
 expect(evaluateCalibration({...historical,candidateCatalogVersion:'catalog-1'}).adoptionEligible).toBe(false);
 expect(evaluateCalibration({...historical,source:{...historical.source,authorized:false}}).adoptionEligible).toBe(false);
});
it('accepts sparse non-scoring credits without requiring a made two and clamps extreme proposals',()=>{
 const sparse={...input.records[0],gameId:'sparse',stats:{ast:1}};
 expect(evaluateCalibration({...input,records:[...input.records,sparse]}).positions.PG.trainingCount).toBe(3);
 const extreme=structuredClone(input);extreme.records=extreme.records.map(row=>({...row,stats:{pts2:row.position==='PG'?1:100}}));
 const report=evaluateCalibration(extreme);expect(report.proposedWeights.PG).toBe(1.25);expect(Object.values(report.proposedWeights).every(weight=>weight>=0.8&&weight<=1.25)).toBe(true);expect(report.adoptionEligible).toBe(false);
});
