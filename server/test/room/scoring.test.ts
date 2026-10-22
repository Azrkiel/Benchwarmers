import { describe, it, expect } from 'vitest';
import { scorePrediction, FOUR_WAY_PROBABILITIES, positionPoints, DEFAULT_RULES, statLine } from '../../src/room/scoring.js';
import { PLAYERS } from '../../src/room/replay/data.js';
import { buildTimeline } from '../../src/room/replay/timeline.js';
import { fantasyPoints } from '../../src/room/replay/scoring.js';
describe('room scoring', () => {
  it('uses a conditional historical reference, never scripted future results', () => {
    const total = 14731+9962+24918+6895+3259+832;
    expect(FOUR_WAY_PROBABILITIES.TD).toBeCloseTo(14731/total);
    expect(FOUR_WAY_PROBABILITIES.TURNOVER).toBeCloseTo((6895+3259+832)/total);
    expect(Object.values(FOUR_WAY_PROBABILITIES).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
  });
  it('combines and caps streak, speed, minority and calibrated probability', () => {
    const score = scorePrediction({optionId:'TD',result:'TD',base:10,probability:.05,optionCount:4,streak:2,elapsedFraction:0,same:1,pickers:3});
    expect(score).toMatchObject({correct:true,points:50,factor:5,base:10});
    expect(score.bonuses).toEqual(expect.arrayContaining(['streak','early_call','lone_call','bold_call']));
    expect(scorePrediction({optionId:'no',result:'yes',base:10,optionCount:2,streak:2,elapsedFraction:1,same:2,pickers:3}).points).toBe(0);
  });
  it('keeps position weights explicit and visible specialist stat lines', () => {
    expect(positionPoints({teamRushYds:86},'OL','OL',DEFAULT_RULES)).toBeCloseTo(8.6*DEFAULT_RULES.positionMultipliers.OL);
    expect(statLine({cleanSnaps:8})).toContain('8 clean snaps');
    expect(statLine({puntYds:148,puntIn20:3})).toContain('148 punt yd');
  });
  it('uses quick timing, minority thresholds, neutral missing odds and half-point rounding',()=>{
    const base={optionId:'yes',result:'yes',base:10,optionCount:2,streak:0,elapsedFraction:.4,same:2,pickers:5};
    const score=scorePrediction(base);expect(score.factor).toBeCloseTo(1.1*1.2);expect(score.points).toBe(13);
    expect(score.bonuses).toEqual(['quick_call','against_the_room']);
    expect(scorePrediction({...base,elapsedFraction:1,same:1,pickers:1}).factor).toBe(1);
    expect(scorePrediction({...base,elapsedFraction:1,probability:1,same:2,pickers:2}).factor).toBe(.5);
    expect(scorePrediction({...base,elapsedFraction:1,optionCount:4,probability:.25,same:2,pickers:2}).factor).toBe(1);
  });
  it('narrows this demo script position spread while preserving raw stats and salaries',()=>{
    const stats:Record<string,Record<string,number>>={};
    for(const b of buildTimeline().beats)for(const[id,key,n]of b.deltas){stats[id]??={};stats[id][key]=(stats[id][key]??0)+n;}
    const raw=PLAYERS.map(p=>fantasyPoints(stats[p.id],p.role));
    const weighted=PLAYERS.map(p=>positionPoints(stats[p.id],p.role,p.pos,DEFAULT_RULES));
    const spread=(values:number[])=>Math.max(...values)/Math.min(...values);
    expect(spread(weighted)).toBeLessThan(spread(raw));expect(spread(weighted)).toBeLessThanOrEqual(3);
    expect(Math.min(...weighted)).toBeCloseTo(9);expect(Math.max(...weighted)).toBeCloseTo(23.7,1);
  });
});
