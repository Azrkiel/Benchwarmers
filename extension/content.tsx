import { createRoot, type Root } from 'react-dom/client';
import { CrewOverlay } from '../web/src/overlay/CrewOverlay';
import { isPartyState, validPartyCode, type PartyReader } from '../web/src/overlay/liveSource';

// Runs only on YouTube. The settings toggle opts the viewer into displaying it.
let root:Root|undefined,host:HTMLDivElement|undefined;
let enabled=false,code='latest',reader:PartyReader|undefined;
let lastGeometry='';
let disposed=false;

function unmount(){root?.unmount();host?.remove();root=undefined;host=undefined;lastGeometry='';}
async function settings(){
  try{
    const values=await chrome.storage.local.get(['bwEnabled','bwPartyCode']);
    enabled=values.bwEnabled===true;
    const next=validPartyCode(values.bwPartyCode)?values.bwPartyCode:'latest';
    if(next!==code||!reader){
      code=next;
      const selected=code;
      reader=async()=>{
        const reply=await chrome.runtime.sendMessage({type:'bw:read-party',code:selected}) as {ok?:boolean;state?:unknown;error?:string};
        if(!reply?.ok||!isPartyState(reply.state))throw new Error(reply?.error||'Backend unavailable. Open the control page and start the server.');
        return reply.state;
      };
      lastGeometry='';
    }
    refresh();
  }catch{unmount();}
}
function refresh(){
  if(disposed)return;
  const player=document.querySelector<HTMLElement>('#movie_player');
  if(!enabled||location.pathname!=='/watch'||!player){unmount();return;}
  const fullscreen=document.fullscreenElement;
  // A video-only fullscreen element cannot contain an HTML overlay.
  if(fullscreen&&(fullscreen instanceof HTMLVideoElement||!fullscreen.contains(player)&&fullscreen!==player)){unmount();return;}
  const mount=fullscreen??document.body;
  if(!host){
    host=document.createElement('div');host.id='benchwarmers-youtube-overlay';
    Object.assign(host.style,{position:'fixed',zIndex:'2147483647',pointerEvents:'none',overflow:'visible'});
    const shadow=host.attachShadow({mode:'open'});
    root=createRoot(shadow);lastGeometry='';
  }
  if(host.parentElement!==mount)mount.appendChild(host);
  const bounds=player.getBoundingClientRect();
  if(bounds.width<100||bounds.height<100){unmount();return;}
  Object.assign(host.style,{left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`});
  const menuOpen=[...player.querySelectorAll<HTMLElement>('.ytp-settings-menu,.ytp-contextmenu,.ytp-share-panel')]
    .some(element=>{const css=getComputedStyle(element);return css.display!=='none'&&css.visibility!=='hidden'&&css.opacity!=='0'&&element.getBoundingClientRect().height>0;});
  const geometry=`${bounds.width},${bounds.height},${menuOpen}`;
  if(geometry!==lastGeometry){lastGeometry=geometry;root!.render(<CrewOverlay controlsBase="http://127.0.0.1:5173" read={reader!} width={bounds.width} height={bounds.height} hostBusy={menuOpen} onHide={()=>void chrome.storage.local.set({bwEnabled:false})}/>);}
}
function onSettings(_changes:Record<string,unknown>,area:string){if(area==='local')void settings();}
let timer:ReturnType<typeof setInterval>;
function start(){
  disposed=false;
  chrome.storage.onChanged.addListener(onSettings);
  document.addEventListener('fullscreenchange',refresh);
  document.addEventListener('yt-navigate-finish',refresh);
  window.addEventListener('resize',refresh);
  window.addEventListener('scroll',refresh,{passive:true});
  timer=setInterval(refresh,400);void settings();
}
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);chrome.storage.onChanged.removeListener(onSettings);document.removeEventListener('fullscreenchange',refresh);document.removeEventListener('yt-navigate-finish',refresh);window.removeEventListener('resize',refresh);window.removeEventListener('scroll',refresh);unmount();});
window.addEventListener('pageshow',event=>{if(event.persisted&&disposed)start();});
start();
