import { validPartyCode } from '../web/src/overlay/liveSource';
const code=document.getElementById('code') as HTMLInputElement;
const status=document.getElementById('status')!;
void chrome.storage.local.get(['bwPartyCode','bwEnabled']).then(values=>{
  if(validPartyCode(values.bwPartyCode))code.value=values.bwPartyCode;
  status.textContent=values.bwEnabled?'Overlay enabled. Open a video on YouTube.':'Overlay is off.';
});
document.getElementById('settings')!.addEventListener('submit',event=>{
  event.preventDefault();
  const value=code.value.trim();
  if(!validPartyCode(value)){status.textContent='Use a party code or latest (letters, numbers, hyphens).';return;}
  void chrome.storage.local.set({bwPartyCode:value,bwEnabled:true}).then(async()=>{
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    status.textContent=tabs[0]?.url?.startsWith('https://www.youtube.com/watch')?'Enabled. Look for Crew beside the video.':'Enabled. Open a video on www.youtube.com, then look for Crew.';
  }).catch(()=>{status.textContent='Could not save settings. Reopen the popup and try again.';});
});
document.getElementById('hide')!.addEventListener('click',()=>{
  void chrome.storage.local.set({bwEnabled:false}).then(()=>{status.textContent='Overlay hidden.';});
});
