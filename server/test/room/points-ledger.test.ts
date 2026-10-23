import { describe, expect, it } from 'vitest';
import { createPointsState, grantBank, bankFor, rewardFreePick, pointsToUnits, validatePointsState } from '../../src/room/points/ledger.js';

describe('integer half-point ledger',()=>{
  it('separates the initial grant from competitive points and posts each reward once',()=>{
    const empty=createPointsState();
    const granted=grantBank(empty,'p1',1000);
    expect(empty.entries).toEqual([]);
    expect(bankFor(granted,'p1')).toEqual({grantPoints:100,availablePoints:100,reservedPoints:0,settledRiskNet:0,correctionDebt:0});
    const rewarded=rewardFreePick(granted,'p1','question-1',25.5,1100);
    expect(rewarded.entries.at(-1)!.units).toBe(51);
    expect(bankFor(rewarded,'p1').availablePoints).toBe(125.5);
    expect(rewardFreePick(rewarded,'p1','question-1',25.5,1200)).toEqual(rewarded);
    expect(()=>rewardFreePick(rewarded,'p1','question-1',26,1200)).toThrow(/conflict/i);
    expect(grantBank(rewarded,'p1',1300)).toEqual(rewarded);
    expect(validatePointsState(JSON.parse(JSON.stringify(rewarded)))).toEqual(rewarded);
  });
  it.each([-1,NaN,Infinity,0.25,Number.MAX_SAFE_INTEGER])('rejects invalid point amount %s',points=>{
    expect(()=>pointsToUnits(points)).toThrow();
  });
  it('rejects ledger tampering, duplicate postings and unsafe integer units',()=>{
    const state=grantBank(createPointsState(),'p1',1000);
    const duplicate=structuredClone(state);duplicate.entries.push(duplicate.entries[0]);
    expect(()=>validatePointsState(duplicate)).toThrow();
    for(const units of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER+1]){
      const invalid=structuredClone(state);invalid.entries[0].units=units;
      expect(()=>validatePointsState(invalid)).toThrow();
    }
    const invalid=structuredClone(state);invalid.entries[0].direction='debit';
    expect(()=>validatePointsState(invalid)).toThrow();
    expect(()=>rewardFreePick(state,'p1','overflow',Number.MAX_SAFE_INTEGER/2,2000)).toThrow(expect.objectContaining({code:'INVALID_POINTS'}));
  });
});
