import { App } from '@modelcontextprotocol/ext-apps';
import './styles.css';
import { formatCountdown, renderApp, type Model, type View } from './render.ts';
import { renderRoomBoard, roomViewOf } from './roomBoard.ts';
import type { RoomView } from '../../../shared/room.js';

const appEl = document.getElementById('app')!;
const toastEl = document.getElementById('toast')!;

const TOOL_FOR_VIEW: Record<View, string> = { draft: 'list_available_players', tonight: 'get_leaderboard', season: 'get_season_standings' };

const model: Model = { view: 'draft', now: Date.now() };
// Set once a room tool result arrives; the board then renders room state, never the household fixture.
let room: RoomView | undefined;
try {
  model.selectedMember = localStorage.getItem('bw-member') || undefined;
} catch {
  /* iframe may block storage */
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
}

function actionKey(el: HTMLElement): string { return ['action','view','member','player','prop','option'].map(key => el.dataset[key] ?? '').join('|'); }
function render() {
  const focused = document.activeElement as HTMLElement | null;
  const focusKey = focused && appEl.contains(focused) && focused.dataset.action ? actionKey(focused) : undefined;
  model.now = Date.now();
  appEl.innerHTML = room ? renderRoomBoard(room, { pending: model.pending, error: model.error }) : renderApp(model);
  const controls = [...appEl.querySelectorAll<HTMLButtonElement>('[data-action]')];
  if (model.pending) controls.forEach(el => {
    el.setAttribute('aria-disabled','true');
    if (actionKey(el) !== focusKey) el.disabled = true;
  });
  if (focusKey) {
    const same = controls.find(el => actionKey(el) === focusKey && !el.disabled);
    (same ?? controls.find(el => el.dataset.action === 'member' && el.getAttribute('aria-pressed') === 'true' && !el.disabled))?.focus();
  }
}

type ToolResult = { isError?: boolean; content?: { type: string; text?: string }[]; structuredContent?: Record<string, any> };

function handleResult(res: ToolResult) {
  if (res.isError) {
    model.error = res.content?.find((c) => c.type === 'text')?.text ?? 'Could not complete that action.';
    render();
    return;
  }
  const sc = res.structuredContent;
  if (!sc) return;
  const roomView = roomViewOf(sc);
  if (roomView) { room = roomView; model.error = undefined; render(); return; }
  if (sc.view === 'draft' || sc.view === 'tonight' || sc.view === 'season') model.view = sc.view;
  if (sc.code) model.code = sc.code;
  if (sc.state) {
    model.state = sc.state;
    const secs = sc.state.activeProp?.realSecondsToLock;
    model.lockAt = secs !== undefined ? Date.now() + secs * 1000 : undefined;
  }
  if (sc.season) model.season = sc.season;
  render();
}

let lastCall: { name: string; args: Record<string, unknown> } | undefined;
async function call(name: string, args: Record<string, unknown>) {
  if (model.pending) return;
  lastCall = {name,args}; model.pending = true; model.error = undefined; render();
  try {
    handleResult((await app.callServerTool({ name, arguments: args })) as ToolResult);
  } catch (err) {
    model.error = err instanceof Error ? err.message : 'Could not reach the game.';
  } finally { model.pending = false; render(); }
}

const app = new App({ name: 'Benchwarmers', version: '0.1.0' });
app.ontoolresult = (res) => handleResult(res as ToolResult);
app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) document.documentElement.classList.toggle('light', ctx.theme === 'light');
};
app.onerror = console.error;

appEl.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  if (model.pending) return;
  const d = el.dataset;
  const code = model.code ? { code: model.code } : {};
  switch (d.action) {
    case 'retry':
      if (lastCall) void call(lastCall.name, lastCall.args);
      else void app.connect().then(() => { model.error = undefined; render(); }).catch(() => { model.error = 'Could not connect to the game. Retry to reconnect.'; render(); });
      break;
    case 'room-refresh':
      if (room) void call('room_status', { code: room.room.code });
      break;
    case 'tab':
      void call(TOOL_FOR_VIEW[d.view as View], code);
      break;
    case 'member':
      model.selectedMember = d.member;
      try {
        localStorage.setItem('bw-member', d.member ?? '');
      } catch {
        /* ignore */
      }
      render();
      break;
    case 'pick':
    case 'draft':
      if (!model.selectedMember) return toast('Choose a player to continue.');
      if (d.action === 'pick') void call('make_pick', { ...code, memberName: model.selectedMember, choice: d.option, propId: d.prop, source: 'screen' });
      else void call('draft_player', { ...code, memberName: model.selectedMember, player: d.player });
      break;
  }
});

setInterval(() => {
  const el = appEl.querySelector('[data-countdown]');
  if (!el || model.lockAt === undefined) return;
  const left = model.lockAt - Date.now();
  el.textContent = left > 0 ? `Closes in ${formatCountdown(left)}` : 'Picks locked';
  if (left <= 0) appEl.querySelectorAll<HTMLButtonElement>('[data-action="pick"]').forEach((b) => (b.disabled = true));
}, 250);

render();
try { await app.connect(); } catch { model.error = 'Could not connect to the game. Retry to reconnect.'; render(); }
const ctx = app.getHostContext();
if (ctx?.theme) document.documentElement.classList.toggle('light', ctx.theme === 'light');
