import { App } from '@modelcontextprotocol/ext-apps';
import './styles.css';
import { formatCountdown, renderApp, type Model, type View } from './render.ts';

const appEl = document.getElementById('app')!;
const toastEl = document.getElementById('toast')!;

const TOOL_FOR_VIEW: Record<View, string> = { draft: 'list_available_players', tonight: 'get_leaderboard', season: 'get_season_standings' };

const model: Model = { view: 'draft', now: Date.now() };
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

function render() {
  model.now = Date.now();
  appEl.innerHTML = renderApp(model);
}

type ToolResult = { isError?: boolean; content?: { type: string; text?: string }[]; structuredContent?: Record<string, any> };

function handleResult(res: ToolResult) {
  if (res.isError) {
    toast(res.content?.find((c) => c.type === 'text')?.text ?? 'Something went wrong.');
    return;
  }
  const sc = res.structuredContent;
  if (!sc) return;
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

async function call(name: string, args: Record<string, unknown>) {
  try {
    handleResult((await app.callServerTool({ name, arguments: args })) as ToolResult);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not reach the game.');
  }
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
  const d = el.dataset;
  const code = model.code ? { code: model.code } : {};
  switch (d.action) {
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
      if (!model.selectedMember) return toast('Tap your name first.');
      if (d.action === 'pick') void call('make_pick', { ...code, memberName: model.selectedMember, choice: d.option, propId: d.prop, source: 'screen' });
      else void call('draft_player', { ...code, memberName: model.selectedMember, player: d.player });
      break;
  }
});

setInterval(() => {
  const el = appEl.querySelector('[data-countdown]');
  if (!el || model.lockAt === undefined) return;
  const left = model.lockAt - Date.now();
  el.textContent = formatCountdown(left);
  if (left <= 0) appEl.querySelectorAll<HTMLButtonElement>('[data-action="pick"]').forEach((b) => (b.disabled = true));
}, 250);

render();
await app.connect();
const ctx = app.getHostContext();
if (ctx?.theme) document.documentElement.classList.toggle('light', ctx.theme === 'light');
