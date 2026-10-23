import {expect,it} from 'vitest';
import {RoomStore} from '../../src/room/store.js';
import {SecurityTelemetry} from '../../src/room/security/index.js';
it('never turns a committed mutation into an error when an optional metric sink fails',()=>{
 class BrokenMetrics extends SecurityTelemetry {override record(){throw new Error('metric sink');}}
 const store=new RoomStore({persist:false,telemetry:new BrokenMetrics()});
 expect(()=>store.create()).not.toThrow();expect(store.list()).toHaveLength(1);
});
