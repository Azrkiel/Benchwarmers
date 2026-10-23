import { isPartyState, validPartyCode } from '../web/src/overlay/liveSource';
const code=document.getElementById('code') as HTMLInputElement;
const mode=document.getElementById('party-mode') as HTMLSelectElement;
const status=document.getElementById('status')!;
const field=document.getElementById('code-field')!;
const error=document.getElementById('code-error')!;
const hide=document.getElementById('hide') as HTMLButtonElement;
const apply=document.getElementById('apply') as HTMLButtonElement;
const controls=document.getElementById('controls') as HTMLAnchorElement;
let busy=false;
function sync(){field.hidden=mode.value==='latest';error.hidden=true;code.removeAttribute('aria-invalid');}
async function connection(value:string){
  controls.href=`http://127.0.0.1:5173/control/${encodeURIComponent(value)}`;
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tabs[0]?.url?.startsWith('https://www.youtube.com/watch')){status.textContent='Overlay enabled · Open a YouTube video';return;}
  status.textContent='Overlay enabled · Connecting to game…';
  try{
    const reply=await chrome.runtime.sendMessage({type:'bw:read-party',code:value}) as {ok?:boolean;state?:unknown};
    status.textContent=reply.ok&&isPartyState(reply.state)?`Connected to ${reply.state.party.code} · Select Crew in the video`:'Overlay enabled · Game unavailable. Open controls to retry.';
  }catch{status.textContent='Overlay enabled · Game unavailable. Open controls to retry.';}
}
void chrome.storage.local.get(['bwPartyCode','bwEnabled']).then(async values=>{
  const value=validPartyCode(values.bwPartyCode)?values.bwPartyCode:'latest';
  mode.value=value.toLowerCase()==='latest'?'latest':'code';code.value=mode.value==='code'?value:'';sync();
  hide.hidden=!values.bwEnabled;
  if(values.bwEnabled)await connection(value);else status.textContent='Overlay off';
}).catch(()=>{status.textContent='Could not load settings. Reopen the popup to retry.';});
mode.addEventListener('change',sync);
document.getElementById('settings')!.addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;
  const value=mode.value==='latest'?'latest':code.value.trim();
  if(!validPartyCode(value)||mode.value==='code'&&value.toLowerCase()==='latest'){error.hidden=false;error.textContent='Enter a party code using letters, numbers or hyphens.';code.setAttribute('aria-invalid','true');code.focus();return;}
  busy=true;apply.disabled=true;apply.textContent='Applying…';
  void chrome.storage.local.set({bwPartyCode:value,bwEnabled:true}).then(async()=>{hide.hidden=false;await connection(value);}).catch(()=>{status.textContent='Could not save settings. Try Apply again.';}).finally(()=>{busy=false;apply.disabled=false;apply.textContent='Apply and show';});
});
hide.addEventListener('click',()=>{
  if(busy)return;
  void chrome.storage.local.set({bwEnabled:false}).then(()=>{status.textContent='Overlay off';hide.hidden=true;}).catch(()=>{status.textContent='Could not hide overlay. Try again.';});
});
