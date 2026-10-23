import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@shared/room';
import { statLine, money, points } from './components';

type Selection = { captainId: string; flexIds: string[] };
type Player = RoomView['players'][number] & { projection?: number };
export type LineupSort = 'projection' | 'salary' | 'name';

// Unsaved lobby edits survive switching room views (the editor unmounts) for the session.
const drafts = new Map<string, Selection>();
/** Forget unsaved lineup drafts (tests and sign-out). */
export function clearLineupDrafts() { drafts.clear(); }
const draftKey = (view: RoomView) => `${view.room.code}:${view.me?.participantId ?? ''}`;

/** Stable order: the chosen key, then player id, so polls never reshuffle equal rows. */
export function sortPlayers(players: Player[], sort: LineupSort): Player[] {
  const key = (p: Player) => sort === 'projection' ? -(p.projection ?? -Infinity) : sort === 'salary' ? -p.salary : 0;
  return [...players].sort((a, b) => key(a) - key(b) || (sort === 'name' ? a.name.localeCompare(b.name) : 0) || a.id.localeCompare(b.id));
}

export function Lineup({ view, busy, onSave, onAuto }: { view: RoomView; busy: boolean; onSave: (selection: Selection) => Promise<RoomView | undefined>; onAuto: (style: string) => Promise<RoomView | undefined> }) {
  const draft = view.room.phase === 'lobby' ? drafts.get(draftKey(view)) : undefined;
  const [captainId, setCaptainState] = useState(() => draft?.captainId ?? view.me?.lineup?.captainId ?? '');
  const [flexIds, setFlexState] = useState<string[]>(() => draft?.flexIds ?? view.me?.lineup?.flexIds ?? []);
  const selection = useRef({ captainId, flexIds });
  const setCaptain = (id: string) => { selection.current = { ...selection.current, captainId: id }; drafts.set(draftKey(view), selection.current); setCaptainState(id); };
  const setFlex = (ids: string[]) => { selection.current = { ...selection.current, flexIds: ids }; drafts.set(draftKey(view), selection.current); setFlexState(ids); };
  const hasProjection = view.players.some((player) => typeof (player as Player).projection === 'number');
  const [sort, setSort] = useState<LineupSort>(hasProjection ? 'projection' : 'salary');
  const [team, setTeam] = useState('all');
  const [position, setPosition] = useState('all');
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('balanced');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<'save' | 'auto'>();
  const [actionError, setActionError] = useState('');
  const serverLineup = JSON.stringify(view.me?.lineup);
  const lastServerState = useRef({ lineup: serverLineup, participantId: view.me?.participantId });
  function apply(fresh: RoomView) {
    setCaptain(fresh.me?.lineup?.captainId ?? ''); setFlex(fresh.me?.lineup?.flexIds ?? []); drafts.delete(draftKey(view)); setError(''); setNotice('Lineup saved');
  }
  useEffect(() => {
    const previous = lastServerState.current;
    if (previous.lineup === serverLineup && previous.participantId === view.me?.participantId) return;
    lastServerState.current = { lineup: serverLineup, participantId: view.me?.participantId };
    setCaptain(view.me?.lineup?.captainId ?? ''); setFlex(view.me?.lineup?.flexIds ?? []); drafts.delete(draftKey(view));
  }, [serverLineup, view.me?.participantId]);
  const cost = (captain: string, flex: string[]) => view.players.reduce((total, player) => total + (player.id === captain ? player.salary * view.rules.captainMultiplier : flex.includes(player.id) ? player.salary : 0), 0);
  const salary = cost(captainId, flexIds);
  const locked = view.room.phase !== 'lobby';
  const complete = !!captainId && flexIds.length === view.rules.flexSlots;
  const unchanged = captainId === view.me?.lineup?.captainId && flexIds.length === view.me?.lineup?.flexIds.length && flexIds.every((id) => view.me?.lineup?.flexIds.includes(id));
  const missing = view.rules.flexSlots - flexIds.length;
  const state = pending === 'save' ? 'Saving…' : pending === 'auto' ? 'Auto-picking…' : unchanged ? 'Lineup saved' : !complete ? `${!captainId ? 'Choose a captain' : 'Choose'}${!captainId && missing ? ' and' : ''}${missing ? ` ${missing} ${flexIds.length ? 'more ' : ''}flex ${missing === 1 ? 'player' : 'players'}` : ''}` : 'Unsaved changes';
  async function submit(kind: 'save' | 'auto') {
    setPending(kind); setActionError('');
    try {
      const fresh = await (kind === 'save' ? onSave({ captainId, flexIds }) : onAuto(style));
      if (fresh) apply(fresh);
      else setActionError(kind === 'save' ? 'Lineup not saved. Try again.' : 'Auto-pick failed. Try again.');
    } catch { setActionError(kind === 'save' ? 'Lineup not saved. Try again.' : 'Auto-pick failed. Try again.'); }
    finally { setPending(undefined); }
  }
  function change(id: string, captain: boolean) {
    if (locked || busy) return;
    let nextCaptain = captainId;
    let nextFlex = [...flexIds];
    const moved = captain ? flexIds.includes(id) : id === captainId;
    if (captain) { nextCaptain = captainId === id ? '' : id; nextFlex = nextFlex.filter((playerId) => playerId !== id); }
    else if (nextFlex.includes(id)) nextFlex = nextFlex.filter((playerId) => playerId !== id);
    else {
      if (id === nextCaptain) nextCaptain = '';
      if (nextFlex.length >= view.rules.flexSlots) { setError('Remove a flex player before adding another.'); return; }
      nextFlex.push(id);
    }
    const nextCost = cost(nextCaptain, nextFlex);
    if (nextCost > view.rules.salaryCap) { setError(`Over the salary cap by ${money(nextCost - view.rules.salaryCap)}. Choose a lower salary.`); return; }
    setCaptain(nextCaptain); setFlex(nextFlex); setError('');
    setNotice(moved ? `${view.players.find((p) => p.id === id)?.name} moved to ${captain ? 'Captain' : 'Flex'}. Lineup cost ${money(nextCost)}.` : '');
  }
  const selected = new Set([captainId, ...flexIds].filter(Boolean));
  const positions = [...new Set(view.players.map((player) => player.position))];
  const teams = [...new Set(view.players.map((player) => player.teamShort))];
  const players = sortPlayers((view.players as Player[]).filter((player) => locked ? selected.has(player.id) : (position === 'all' || position === player.position) && (team === 'all' || team === player.teamShort) && `${player.name} ${player.role}`.toLowerCase().includes(search.toLowerCase())), sort);
  function slot(id: string | undefined, role: string) {
    const player = view.players.find((p) => p.id === id);
    return <div className={`rm-lineup-slot${player ? ' is-filled' : ''}`} key={role}><span>{role}</span><b>{player?.name ?? 'Choose player'}</b>{player && <small>{money(player.salary * (role === 'Captain' ? view.rules.captainMultiplier : 1))}</small>}{player && !locked && <button aria-label={`Remove ${role} ${player.name}`} disabled={busy} onClick={() => change(player.id, role === 'Captain')}>Remove</button>}</div>;
  }
  return <section className="rm-lineup" aria-labelledby="rm-lineup-title">
    <div className="rm-section-heading"><h2 id="rm-lineup-title">Your lineup</h2><span>{selected.size} / {view.rules.flexSlots + 1} players</span></div>
    <div className="rm-lineup-slots" role="group" aria-label="Selected lineup">{slot(captainId, 'Captain')}{Array.from({ length: view.rules.flexSlots }, (_, i) => slot(flexIds[i], `Flex ${i + 1}`))}</div>
    <div className="rm-budget"><strong>{money(salary)} / {money(view.rules.salaryCap)}</strong><span>{money(view.rules.salaryCap - salary)} left</span><meter aria-label="Salary cap used" min="0" max={view.rules.salaryCap} value={salary} /></div>
    <p className="rm-muted">Captain: {view.rules.captainMultiplier}× salary and points. {view.rules.flexSlots} flex players at regular salary.</p>
    {locked ? <p className="rm-lock">Lineup locked</p> : <>
      <div className="rm-auto"><label>Auto-pick style<select value={style} onChange={(e) => setStyle(e.target.value)}><option value="balanced">Balanced</option><option value="stars">Stars</option><option value="value">Value</option></select></label><button disabled={busy || !!pending} onClick={() => { void submit('auto'); }}>{pending === 'auto' ? 'Auto-picking…' : 'Auto-pick lineup'}</button></div>
      <details className="rm-auto-help"><summary>About auto-pick styles</summary><p>Balanced mixes salaries. Stars favors higher salaries. Value favors lower salaries. All styles stay within the cap.</p></details>
      <div className="rm-filters"><label>Position<select value={position} onChange={(event) => setPosition(event.target.value)}><option value="all">All positions</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}</select></label><label>Team<select value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">All teams</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select></label><label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as LineupSort)}>{hasProjection && <option value="projection">Projected points</option>}<option value="salary">Salary</option><option value="name">Name</option></select></label><label>Find a player<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players" /></label></div>
    </>}
    {error && <p className="rm-error" role="alert">{error}</p>}{notice && <p className="rm-lineup-notice" role="status">{notice}</p>}
    {!players.length && <div className="rm-empty"><p>No players match</p><button onClick={() => { setSearch(''); setPosition('all'); setTeam('all'); }}>Clear filters</button></div>}
    <div className="rm-players">{players.map((player) => <article key={player.id} className={`rm-player${selected.has(player.id) ? ' is-selected' : ''}`}>
      <div className="rm-player-info"><span className="rm-player-pos">{player.position} · {player.teamShort}</span><h3>{player.name}</h3>{locked ? <><strong>{points(player.points)} pts</strong><p>{statLine(player.statLine)}</p></> : <><strong>{money(player.salary)}</strong>{typeof player.projection === 'number' && <span className="rm-projection">Proj {points(player.projection)} pts</span>}<details><summary>Player details</summary><p>{player.role}</p></details></>}</div>
      {locked ? <span className="rm-selected-label">{captainId === player.id ? 'Captain' : 'Flex'}</span> : <div className="rm-player-actions"><button aria-label={`Captain ${player.name}`} aria-pressed={captainId === player.id} disabled={busy} onClick={() => change(player.id, true)}>{captainId === player.id ? '✓ Captain' : 'Captain'}<small>{money(player.salary * view.rules.captainMultiplier)}</small></button><button aria-label={`${flexIds.includes(player.id) ? 'Remove' : 'Add'} ${player.name}`} aria-pressed={flexIds.includes(player.id)} disabled={busy} onClick={() => change(player.id, false)}>{flexIds.includes(player.id) ? '✓ Flex' : '+ Flex'}<small>{money(player.salary)}</small></button></div>}
    </article>)}</div>
    {!locked && <div className="rm-save"><div><strong>{money(view.rules.salaryCap - salary)} left</strong><span role="status">{state}</span>{actionError && <span role="status" className="rm-error">{actionError}</span>}</div><button className="rm-primary" disabled={busy || !!pending || !complete || salary > view.rules.salaryCap} onClick={() => { void submit('save'); }}>{pending === 'save' ? 'Saving…' : 'Save lineup'}</button></div>}
  </section>;
}
