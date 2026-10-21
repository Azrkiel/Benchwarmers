// Pure render functions: tool result / state in, HTML string out. No DOM, no App import.
import type { DraftBoardEntry, Household, PartyStateResponse, PropView, SeasonResponse, StandingRow } from '../../../shared/types.js';

export type View = 'draft' | 'tonight' | 'season';

export type Model = {
  view: View;
  code?: string;
  state?: PartyStateResponse;
  season?: SeasonResponse;
  selectedMember?: string;
  /** Epoch ms when the active prop's lock time is reached (computed at receipt). */
  lockAt?: number;
  now: number;
};

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const e = escapeHtml;

/** Only plain hex colors reach a style attribute; anything else falls back. */
export function safeColor(c: string | undefined, fallback = '#888888'): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}

/** Black or white, whichever reads better on the given background. */
export function readableText(bg: string): string {
  const c = safeColor(bg);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111111' : '#ffffff';
}

function householdOf(households: Household[], id: string | undefined): Household | undefined {
  return households.find((h) => h.id === id);
}

function badge(name: string, color: string | undefined): string {
  const bg = safeColor(color);
  return `<span class="badge" style="background:${bg};color:${readableText(bg)}">${e(name)}</span>`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Locked';
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function flames(streak: number): string {
  return streak > 0 ? `<span class="streak" title="Streak ${streak}">${'🔥'.repeat(Math.min(streak, 3))}${streak}</span>` : '';
}

const TABS: { view: View; label: string }[] = [
  { view: 'draft', label: 'Draft board' },
  { view: 'tonight', label: 'Tonight' },
  { view: 'season', label: 'Season' },
];

export function renderHeader(model: Model): string {
  const st = model.state;
  const title = st ? st.game.title : 'Benchwarmers';
  const code = model.code ?? st?.party.code;
  const live = st && (st.party.status === 'live' || st.party.status === 'final');
  const score = live
    ? `<div class="score"><span>${e(st.game.home.short)} ${st.game.home.score}</span> <span>${e(st.game.away.short)} ${st.game.away.score}</span> <span class="clock">${e(st.party.status === 'final' ? 'Final' : st.game.clock)}</span></div>`
    : '';
  return `<header class="head"><div><h1>${e(title)}</h1>${code ? `<div class="code" aria-label="Party code">${e(code)}</div>` : ''}</div>${score}</header>`;
}

export function renderTabs(active: View): string {
  return `<nav class="tabs" role="tablist">${TABS.map((t) => `<button role="tab" class="tab${t.view === active ? ' active' : ''}" aria-selected="${t.view === active}" data-action="tab" data-view="${t.view}">${e(t.label)}</button>`).join('')}</nav>`;
}

export function renderMemberChips(households: Household[], selected: string | undefined): string {
  const chips = households.flatMap((h) =>
    h.members.map((m) => {
      const bg = safeColor(h.color);
      const on = m.name === selected;
      return `<button class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-action="member" data-member="${e(m.name)}" style="--c:${bg};--ct:${readableText(bg)}">${e(m.name)}</button>`;
    }),
  );
  return `<section class="who"><h2>Who's tapping?</h2><div class="chips">${chips.join('')}</div></section>`;
}

function rosterCounts(state: PartyStateResponse): string {
  const rows = state.households.flatMap((h) =>
    h.members.map((m) => {
      const n = state.draftBoard.filter((d) => d.ownerMemberId === m.id).length;
      return `<li>${badge(m.name, h.color)} <span class="count">${n}/3</span></li>`;
    }),
  );
  return `<ul class="rosters">${rows.join('')}</ul>`;
}

function playerCard(d: DraftBoardEntry, state: PartyStateResponse): string {
  const p = d.player;
  const nick = p.nickname ? `<div class="nick">${e(p.nickname)}</div>` : '';
  const meta = `<div class="meta">${e(p.name)} · #${p.number} · ${e(p.position)}</div>`;
  const note = d.scoutingNote ? `<p class="note">${e(d.scoutingNote)}</p>` : '';
  if (d.ownerMemberId) {
    const h = householdOf(state.households, d.householdId);
    const label = `${d.ownerName ?? 'Someone'}${h ? ` · ${h.name}` : ''}`;
    return `<article class="player taken">${nick}${meta}${note}<div>${badge(label, h?.color)}</div></article>`;
  }
  return `<article class="player">${nick}${meta}${note}<button class="big" data-action="draft" data-player="${e(p.id)}">Draft ${e(p.nickname ?? p.name)}</button></article>`;
}

export function renderDraft(state: PartyStateResponse, selectedMember?: string): string {
  const cols = (['home', 'away'] as const).map((side) => {
    const team = state.game[side];
    const entries = state.draftBoard.filter((d) => d.side === side);
    entries.sort((a, b) => Number(!!a.ownerMemberId) - Number(!!b.ownerMemberId));
    const color = safeColor(team.color);
    return `<section class="team" style="--team:${color}"><h2 class="teamname"><span class="swatch"></span>${e(team.name)}</h2>${entries.map((d) => playerCard(d, state)).join('')}</section>`;
  });
  return `${renderMemberChips(state.households, selectedMember)}${rosterCounts(state)}<div class="cols draft">${cols.join('')}</div>`;
}

function pickCard(prop: PropView, state: PartyStateResponse, lockLeftMs: number | undefined): string {
  const left = lockLeftMs ?? (prop.realSecondsToLock ?? 0) * 1000;
  const locked = prop.status !== 'open' || left <= 0;
  const opts = prop.options
    .map((o) => {
      const n = prop.pickCounts?.[o.id] ?? 0;
      return `<button class="big option" data-action="pick" data-prop="${e(prop.id)}" data-option="${e(o.id)}"${locked ? ' disabled' : ''}>${e(o.label)}<span class="n">${n}</span></button>`;
    })
    .join('');
  const who = state.picks
    .filter((p) => p.propId === prop.id)
    .map((p) => `<li>${e(p.memberName)}: ${e(p.optionLabel)}</li>`)
    .join('');
  return `<section class="card pick"><div class="row"><h2>${e(prop.question)}</h2><div class="countdown" data-countdown>${locked ? 'Locked' : formatCountdown(left)}</div></div><div class="options">${opts}</div>${who ? `<ul class="who-picked">${who}</ul>` : ''}</section>`;
}

function lastResolved(state: PartyStateResponse): string {
  const r = state.lastResolvedProp;
  if (!r) return '';
  const correct = r.options.find((o) => o.id === r.correctOptionId);
  return `<p class="resolved"><strong>${e(r.question)}</strong> ${correct ? `Answer: ${e(correct.label)}` : ''}</p>`;
}

export function renderStandings(rows: StandingRow[], state: PartyStateResponse): string {
  const items = rows.map((r) => {
    const h = householdOf(state.households, r.householdId);
    return `<li class="standing"><span class="rank">${r.rank}</span><span class="name">${e(r.name)}</span>${badge(r.household, h?.color)}<span class="total">${r.total}</span><span class="split">draft ${r.draftPoints} + picks ${r.pickPoints}</span>${flames(r.streak)}</li>`;
  });
  return `<section class="card"><h2>Standings</h2><ol class="standings">${items.join('')}</ol></section>`;
}

export function renderTonight(state: PartyStateResponse, now: number, lockAt?: number): string {
  const prop = state.activeProp;
  const left = lockAt !== undefined ? lockAt - now : undefined;
  const active = prop ? pickCard(prop, state, left) : `<section class="card"><h2>No pick is open</h2><p>Hang tight. The next one opens soon.</p></section>`;
  const others = state.picks.filter((p) => p.propId !== state.activeProp?.id);
  const lockedList = others.length
    ? `<section class="card"><h2>Locked picks</h2><ul class="who-picked">${others.map((p) => `<li>${e(p.memberName)}: ${e(p.optionLabel)}${p.correct === undefined ? '' : p.correct ? ' ✓' : ' ✗'}</li>`).join('')}</ul></section>`
    : '';
  const ticker = state.ticker.length ? `<ul class="ticker">${state.ticker.slice(0, 3).map((t) => `<li>${e(t)}</li>`).join('')}</ul>` : '';
  return `<div class="cols tonight"><div>${active}${lastResolved(state)}${lockedList}</div><div>${renderStandings(state.standings, state)}${ticker}</div></div>`;
}

export function renderSeason(season: SeasonResponse): string {
  const rows = season.rows.map((r) => {
    const h = householdOf(season.households, r.householdId);
    return `<li class="standing"><span class="rank">${r.rank}</span><span class="name">${e(r.name)}</span>${badge(r.household, h?.color)}<span class="total">${r.points + r.fantasyPoints}</span><span class="split">picks ${r.points} + fantasy ${r.fantasyPoints} &middot; best streak ${r.bestStreak} &middot; nights won ${r.nightsWon} &middot; ${r.correct}/${r.total} correct</span></li>`;
  });
  return `<section class="card"><h2>${e(season.crew.name)} season</h2><ol class="standings">${rows.join('')}</ol></section>`;
}

export function renderApp(model: Model): string {
  let body: string;
  if (model.view === 'season') body = model.season ? renderSeason(model.season) : '<p class="loading">No season data yet.</p>';
  else if (!model.state) body = '<p class="loading">No game yet. Ask for a watch party to start.</p>';
  else body = model.view === 'draft' ? renderDraft(model.state, model.selectedMember) : renderTonight(model.state, model.now, model.lockAt);
  const who = model.view === 'tonight' && model.state ? renderMemberChips(model.state.households, model.selectedMember) : '';
  return `${renderHeader(model)}${renderTabs(model.view)}${who}<main>${body}</main><footer class="foot">Free to play. No real money.</footer>`;
}
