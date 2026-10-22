import { readParty, validPartyCode } from '../web/src/overlay/liveSource';

chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const input=message as {type?:unknown;code?:unknown}|undefined;
  if(input?.type!=='bw:read-party')return;
  if(sender.id!==chrome.runtime.id || !sender.tab || !sender.url?.startsWith('https://www.youtube.com/') || !validPartyCode(input.code)){
    respond({ok:false,error:'Request not allowed.'});return;
  }
  const request:typeof fetch=(path,options)=>fetch(new URL(String(path),'http://127.0.0.1:3001').href,options);
  readParty(input.code,request).then(state=>respond({ok:true,state}),error=>respond({ok:false,error:error instanceof Error?error.message:'Backend unavailable.'}));
  return true;
});
