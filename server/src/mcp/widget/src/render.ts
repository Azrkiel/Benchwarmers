// Pure render functions: tool result / state in, HTML string out. No DOM, no App import.
import { BONUS_COPY, type DraftBoardEntry, Household, PartyStateResponse, PropView, SeasonResponse, StandingRow } from '../../../shared/types.js';

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
  pending?: boolean;
  error?: string;
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
  return streak > 0 ? `<span class="streak" title="Streak ${streak}">Streak ${streak}</span>` : '';
}

const TABS: { view: View; label: string }[] = [
  { view: 'draft', label: 'Draft' },
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
  return `<header class="head"><div><div class="brand">Benchwarmers <span class="phase">${!st ? 'No party selected' : `Replay · ${st.party.status === 'final' ? 'Final' : st.party.status === 'live' ? 'Playing' : 'Pregame'}`}</span></div><h1>${e(title)}</h1>${code ? `<div class="code" aria-label="Party code">Party ${e(code)}</div>` : ''}</div>${score}</header>`;
}

export function renderTabs(active: View): string {
  return `<nav class="tabs" aria-label="Party views">${TABS.map((t) => `<button class="tab${t.view === active ? ' active' : ''}" aria-pressed="${t.view === active}" data-action="tab" data-view="${t.view}">${e(t.label)}</button>`).join('')}</nav>`;
}

export function renderMemberChips(households: Household[], selected: string | undefined, draftBoard?: DraftBoardEntry[]): string {
  const chips = households.flatMap((h) =>
    h.members.map((m) => {
      const bg = safeColor(h.color);
      const on = m.name === selected;
      const progress = draftBoard ? ` <span class="count">${draftBoard.filter(d => d.ownerMemberId === m.id).length}/3</span>` : '';
      return `<button class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-action="member" data-member="${e(m.name)}" style="--c:${bg};--ct:${readableText(bg)}">${e(m.name)}${progress}</button>`;
    }),
  );
  return `<section class="who"><h2>Playing as</h2><div class="chips">${chips.join('')}</div></section>`;
}

function playerCard(d: DraftBoardEntry, state: PartyStateResponse, selectedMember?: string): string {
  const p = d.player;
  const title = `<div class="pname">${e(p.name)}</div><div class="meta"><span class="pos">${e(p.position)}</span> · ${e(d.teamShort)}</div>`;
  const full = d.scoutingNote ?? '';
  const short = full.length > 60 ? `${full.slice(0, 57).trimEnd()}…` : full;
  const note = full
    ? full.length > 60
      ? `<details class="note"><summary>${e(short)}</summary><p>${e(full)}</p></details>`
      : `<p class="note">${e(full)}</p>`
    : '';
  if (d.ownerMemberId) {
    const h = householdOf(state.households, d.householdId);
    const label = `${d.ownerName ?? 'Someone'}${h ? ` · ${h.name}` : ''}`;
    return `<article class="player taken"><div class="phead">${title}</div>${note}<div>Drafted by ${badge(label, h?.color)}</div></article>`;
  }
  const member = state.households.flatMap(h => h.members).find(m => m.name === selectedMember);
  const full3 = member && state.draftBoard.filter(x => x.ownerMemberId === member.id).length >= 3;
  const unavailable = !member || full3 || state.party.status !== 'drafting';
  const label = !member ? 'Choose player' : full3 ? 'Roster full' : state.party.status !== 'drafting' ? 'Draft closed' : 'Draft';
  const aria = member && !unavailable ? ` aria-label="Draft ${e(p.name)}"` : '';
  return `<article class="player"><div class="phead">${title}<button class="draft-btn" data-action="draft" data-player="${e(p.id)}"${aria}${unavailable ? ' disabled' : ''}>${label}</button></div>${note}</article>`;
}

export function renderDraft(state: PartyStateResponse, selectedMember?: string): string {
  const cols = (['home', 'away'] as const).map((side) => {
    const team = state.game[side];
    const entries = state.draftBoard.filter((d) => d.side === side);
    entries.sort((a, b) => Number(!!a.ownerMemberId) - Number(!!b.ownerMemberId));
    const color = safeColor(team.color);
    return `<section class="team" style="--team:${color}"><h2 class="teamname"><span class="swatch"></span>${e(team.name)}</h2>${entries.map((d) => playerCard(d, state, selectedMember)).join('')}</section>`;
  });
  return `${renderMemberChips(state.households, selectedMember, state.draftBoard)}${selectedMember ? '' : '<p>Choose a player to continue.</p>'}<div class="cols draft">${cols.join('')}</div>`;
}

/** Football drive props carry historical odds; show them as a plain-language line. Basketball props have none. */
export function oddsLine(prop: PropView): string {
  const o = prop.odds;
  if (!o || prop.resolver.kind !== 'driveResult') return '';
  const p = o.p?.yes;
  if (typeof p !== 'number' || !Number.isFinite(p)) return '';
  const pct = Math.round(p * 100);
  const late = o.bucket.includes('two-minute');
  const text =
    prop.resolver.outcome === 'td'
      ? `Drives like this get a touchdown ${pct}% of the time`
      : `Drives like this${late ? ' late in the half' : ''} score ${pct}% of the time`;
  return `<p class="odds">${e(text)}</p>`;
}

/** Compact bonus chips for correct picks on the last resolved prop. */
export function renderBonusChips(state: PartyStateResponse): string {
  const r = state.lastResolvedProp;
  if (!r) return '';
  const chips = state.picks
    .filter((p) => p.propId === r.id && p.score && p.score.correct && p.score.bonuses.length > 0)
    .map((p) => {
      const sc = p.score!;
      const labels = sc.bonuses.slice(0, 2).map((b) => BONUS_COPY[b] ?? b);
      return `<span class="bonus" title="${e(p.memberName)}"><span class="who">${e(p.memberName)}</span> ${e(labels.join(' + '))} · ${sc.points} pts</span>`;
    });
  return chips.length ? `<div class="bonuses">${chips.join('')}</div>` : '';
}

function pickCard(prop: PropView, state: PartyStateResponse, lockLeftMs: number | undefined, selectedMember?: string): string {
  const left = lockLeftMs ?? (prop.realSecondsToLock ?? 0) * 1000;
  const locked = prop.status !== 'open' || left <= 0;
  const member = state.households.flatMap(h => h.members).find(m => m.name === selectedMember);
  const chosen = state.picks.find(p => p.propId === prop.id && p.memberId === member?.id);
  const opts = prop.options
    .map((o) => {
      const n = prop.pickCounts?.[o.id] ?? 0;
      return `<button class="big option${chosen?.optionId === o.id ? ' selected' : ''}" aria-pressed="${chosen?.optionId === o.id}" data-action="pick" data-prop="${e(prop.id)}" data-option="${e(o.id)}"${locked || !member ? ' disabled' : ''}>${e(o.label)}${chosen?.optionId === o.id ? '<span class="your-pick" >✓ Your pick</span>' : ''}<span class="n">${n} ${n === 1 ? "pick" : "picks"}</span></button>`;
    })
    .join('');
  const who = state.picks
    .filter((p) => p.propId === prop.id)
    .map((p) => `<li>${e(p.memberName)}: ${e(p.optionLabel)}</li>`)
    .join('');
  const prompt = !member && !locked ? '<p class="choose-player" role="status">Choose player to make a pick.</p>' : '';
  return `<section class="card pick"><div class="row"><h2>${e(prop.question)}</h2><div class="countdown" data-countdown>${locked ? 'Locked' : `Closes in ${formatCountdown(left)}`}</div></div>${oddsLine(prop)}${prompt}<div class="options">${opts}</div>${who ? `<ul class="who-picked">${who}</ul>` : ''}</section>`;
}

function lastResolved(state: PartyStateResponse): string {
  const r = state.lastResolvedProp;
  if (!r) return '';
  const correct = r.options.find((o) => o.id === r.correctOptionId);
  return `<p class="resolved"><strong>${e(r.question)}</strong> ${correct ? `Answer: ${e(correct.label)}` : ''}</p>${renderBonusChips(state)}`;
}

export function renderStandings(rows: StandingRow[], state: PartyStateResponse): string {
  const items = rows.map((r) => {
    const h = householdOf(state.households, r.householdId);
    return `<li class="standing"><span class="rank">${r.rank}</span><span class="name">${e(r.name)}</span>${badge(r.household, h?.color)}<span class="total">${r.total.toFixed(1)} pts</span><span class="split">draft ${r.draftPoints.toFixed(1)} + picks ${r.pickPoints.toFixed(1)}</span>${flames(r.streak)}</li>`;
  });
  return `<section class="card"><h2>Standings</h2><ol class="standings">${items.join('')}</ol></section>`;
}

export function renderTonight(state: PartyStateResponse, now: number, lockAt?: number, selectedMember?: string): string {
  const prop = state.activeProp;
  const left = lockAt !== undefined ? lockAt - now : undefined;
  const active = prop ? pickCard(prop, state, left, selectedMember) : state.party.status === 'final' ? '<section class="card"><h2>Final</h2><p>Replay finished. See results and season standings.</p><button class="big" data-action="tab" data-view="season">View season</button></section>' : state.party.status === 'drafting' ? '<section class="card"><h2>Pregame</h2><p>Draft players before the replay starts.</p></section>' : (state.props.some((x) => x.status === 'locked') ? '<section class="card"><h2>Picks locked</h2><p>Waiting for result</p></section>' : '<section class="card"><h2>Between picks</h2><p>Waiting for next pick</p></section>');
  const others = state.picks.filter((p) => p.propId !== state.activeProp?.id);
  const groups = [...new Set(others.map(p => p.propId))].reverse();
  const lockedList = groups.length ? `<details class="card"><summary>Pick history</summary>${groups.map(id => {
    const question = state.props.find(prop => prop.id === id) ?? (state.lastResolvedProp?.id === id ? state.lastResolvedProp : undefined);
    return `<section><h3>${e(question?.question ?? 'Previous pick')}</h3><ul class="who-picked">${others.filter(p => p.propId === id).map(p => `<li>${e(p.memberName)}: ${e(p.optionLabel)}${p.correct === undefined ? ' · Result pending' : p.correct ? ' · Correct' : ' · Incorrect'}${p.score ? ` · +${p.score.points} pts` : ''}</li>`).join('')}</ul></section>`;
  }).join('')}</details>` : '';
  const ticker = state.ticker.length ? `<ul class="ticker">${state.ticker.slice(0, 3).map((t) => `<li>${e(t)}</li>`).join('')}</ul>` : '';
  return `<div class="cols tonight"><div>${active}${lastResolved(state)}${lockedList}</div><div>${renderStandings(state.standings, state)}${ticker}</div></div>`;
}

export function renderSeason(season: SeasonResponse): string {
  const rows = season.rows.map((r) => {
    const h = householdOf(season.households, r.householdId);
    return `<li class="standing season-row"><span class="rank">${r.rank}</span><span class="name">${e(r.name)}</span>${badge(r.household, h?.color)}<span class="total">${(r.points + r.fantasyPoints).toFixed(1)}</span><span class="wins">${r.nightsWon}</span><span class="split">Picks ${r.points} · Fantasy ${r.fantasyPoints} · ${r.correct}/${r.total} correct · Best streak ${r.bestStreak}</span></li>`;
  });
  return `<section class="card"><h2>${e(season.crew.name)} season</h2><p class="metric-note">Total points = picks + fantasy. Rank follows season standings.</p><div class="season-head" aria-hidden="true"><span></span><span>Player</span><span>Pts</span><span>Wins</span></div><ol class="standings">${rows.join('')}</ol></section>`;
}

export function renderApp(model: Model): string {
  let body: string;
  if (model.view === 'season') body = model.season ? renderSeason(model.season) : '<p class="loading">No season data yet.</p>';
  else if (!model.state) body = '<p class="loading">No party selected. Create or join a party.</p>';
  else body = model.view === 'draft' ? renderDraft(model.state, model.selectedMember) : renderTonight(model.state, model.now, model.lockAt, model.selectedMember);
  const who = model.view === 'tonight' && model.state ? renderMemberChips(model.state.households, model.selectedMember) : '';
  return `${renderHeader(model)}${renderTabs(model.view)}${who}<div class="feedback" aria-live="polite">${model.pending ? '<p role="status">Submitting…</p>' : ''}${model.error ? `<p role="alert">${e(model.error)} <button data-action="retry">Retry</button></p>` : ''}</div><main aria-busy="${!!model.pending}">${body}</main><footer class="foot">Free to play. No real money.</footer>`;
}
