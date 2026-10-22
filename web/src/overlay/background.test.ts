/// <reference path="../../../extension/chrome.d.ts" />
import { afterEach, expect, it, vi } from 'vitest';
import { liveFixture } from '../lib/fixtures';

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
async function handler(){
  let listener:Parameters<typeof chrome.runtime.onMessage.addListener>[0];
  vi.stubGlobal('chrome',{runtime:{id:'our-extension',onMessage:{addListener:(callback:typeof listener)=>{listener=callback;}}}});
  await import('../../../extension/background');
  return listener!;
}
it('does not proxy requests from other origins, extensions, or invalid codes',async()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);
  const listen=await handler();
  const respond=vi.fn();
  listen({type:'bw:read-party',code:'DEMO'},{id:'other-extension',url:'https://www.youtube.com/watch?v=123',tab:{id:1}},respond);
  listen({type:'bw:read-party',code:'DEMO'},{id:'our-extension',url:'https://www.youtube.com.evil.test/watch',tab:{id:1}},respond);
  listen({type:'bw:read-party',code:'../secret'},{id:'our-extension',url:'https://www.youtube.com/watch',tab:{id:1}},respond);
  expect(request).not.toHaveBeenCalled();
  expect(respond).toHaveBeenCalledTimes(3);
});
it('returns backend state through the fixed local API and never fetches a page-provided URL',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify(liveFixture)));vi.stubGlobal('fetch',request);
  const listen=await handler();
  const reply=await new Promise<unknown>(resolve=>listen({type:'bw:read-party',code:'DEMO',url:'https://other.test'},{id:'our-extension',url:'https://www.youtube.com/watch?v=123',tab:{id:1}},resolve));
  expect(request).toHaveBeenCalledWith('http://127.0.0.1:3001/api/parties/DEMO/state',expect.any(Object));
  expect(reply).toEqual({ok:true,state:liveFixture});
});
