import {expect,it} from 'vitest';
import {normalizeTrackingPoint} from '../../src/live/basketball/tracking.js';
it('normalizes observed court coordinates and explicit side changes',()=>{
 const observation={x:23.5,y:12.5,observedAt:1000,receivedAt:1100,confidence:0.8,source:'synthetic',inPlay:true};
 expect(normalizeTrackingPoint(observation,{length:94,width:50,reverse:false},1200,500)).toMatchObject({status:'observed',x:0.25,y:0.25,observedAt:1000,source:'synthetic'});
 expect(normalizeTrackingPoint(observation,{length:94,width:50,reverse:true},1200,500)).toMatchObject({x:0.75,y:0.75});
});
it('returns unknown for gaps, stale/dead/out-of-bounds/unknown orientation rather than inventing motion',()=>{
 const observation={x:10,y:10,observedAt:1000,receivedAt:1100,confidence:0.8,source:'synthetic',inPlay:true};
 for(const patch of [{x:-1},{inPlay:false},{observedAt:1},{confidence:2},{receivedAt:900}])expect(normalizeTrackingPoint({...observation,...patch},{length:94,width:50,reverse:false},1200,500).status).toBe('unknown');
 expect(normalizeTrackingPoint(observation,{length:94,width:50,reverse:null},1200,500).status).toBe('unknown');
});
