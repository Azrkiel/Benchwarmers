import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@shared/room';
import { statLine, money, points } from './components';

type Selection = { captainId: string; flexIds: string[] };
export function Lineup({ view, busy, onSave, onAuto }: { view: RoomView; busy: boolean; onSave: (selection: Selection) => Promise<RoomView | undefined>; onAuto: (style: string) => Promise<RoomView | undefined> }) {
  const [captainId, setCaptain] = useState(() => view.me?.lineup?.captainId ?? '');
  const [flexIds, setFlex] = useState<string[]>(() => view.me?.lineup?.flexIds ?? []);
  const [position, setPosition] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const serverLineup = JSON.stringify(view.me?.lineup);
  const lastServerState = useRef({ lineup: serverLineup, participantId: view.me?.participantId });
  function apply(fresh: RoomView) {
    setCaptain(fresh.me?.lineup?.captainId ?? ''); setFlex(fresh.me?.lineup?.flexIds ?? []); setError(''); setSaved(true);
  }
  useEffect(() => {
    const previous = lastServerState.current;
    if (previous.lineup === serverLineup && previous.participantId === view.me?.participantId) return;
    lastServerState.current = { lineup: serverLineup, participantId: view.me?.participantId };
    setCaptain(view.me?.lineup?.captainId ?? ''); setFlex(view.me?.lineup?.flexIds ?? []);
  }, [serverLineup, view.me?.participantId]);
  const cost = (captain: string, flex: string[]) => view.players.reduce((total, player) => total + (player.id === captain ? player.salary * view.rules.captainMultiplier : flex.includes(player.id) ? player.salary : 0), 0);
  const salary = cost(captainId, flexIds);
  const locked = view.room.phase !== 'lobby';
  function change(id: string, captain: boolean) {
    if (locked || busy) return;
    let nextCaptain = captainId;
    let nextFlex = [...flexIds];
    if (captain) { nextCaptain = captainId === id ? '' : id; nextFlex = nextFlex.filter((playerId) => playerId !== id); }
    else if (nextFlex.includes(id)) nextFlex = nextFlex.filter((playerId) => playerId !== id);
    else {
      if (id === nextCaptain) nextCaptain = '';
      if (nextFlex.length >= view.rules.flexSlots) { setError(`Choose ${view.rules.flexSlots} flex players. Remove one before adding another.`); return; }
      nextFlex.push(id);
    }
    if (cost(nextCaptain, nextFlex) > view.rules.salaryCap) { setError('Over the salary cap. Try a cheaper player.'); return; }
    setCaptain(nextCaptain); setFlex(nextFlex); setError(''); setSaved(false);
  }
  const selected = new Set([captainId, ...flexIds]);
  const positions = [...new Set(view.players.map((player) => player.position))];
  return <section className="rm-lineup" aria-labelledby="rm-lineup-title"><div className="rm-section-heading"><h2 id="rm-lineup-title">Your lineup</h2><span>{selected.size - (selected.has('') ? 1 : 0)} / {view.rules.flexSlots + 1} players</span></div><div className="rm-budget"><strong>{money(salary)} / {money(view.rules.salaryCap)}</strong><span>{money(view.rules.salaryCap - salary)} left</span><meter aria-label="Salary cap used" min="0" max={view.rules.salaryCap} value={salary} /></div><p className="rm-muted">1 captain ({view.rules.captainMultiplier}× cost and points) + {view.rules.flexSlots} flex.</p>{locked ? <p className="rm-lock">Locked in. Your players score on every snap.</p> : <><div className="rm-auto" role="group" aria-label="Automatic lineup">{['balanced', 'stars', 'value'].map((style) => <button key={style} disabled={busy} onClick={async () => { const fresh = await onAuto(style); if (fresh) apply(fresh); }}>Auto {style}</button>)}</div><div className="rm-filters"><label>Position<select aria-label="Position" value={position} onChange={(event) => setPosition(event.target.value)}><option value="all">All positions</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}</select></label><label>Find a player<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players" /></label></div></>}{error && <p className="rm-error" role="alert">{error}</p>}<div className="rm-players">{view.players.filter((player) => locked ? selected.has(player.id) : (position === 'all' || position === player.position) && `${player.name} ${player.role}`.toLowerCase().includes(search.toLowerCase())).map((player) => <article key={player.id} className={`rm-player${selected.has(player.id) ? ' is-selected' : ''}`}><div className="rm-player-info"><span className="rm-player-pos">{player.position} · {player.teamShort}</span><h3>{player.name}</h3><span>{player.role}</span><strong>{money(player.salary)} <small>{points(player.points)} pts</small></strong><p>{statLine(player.statLine)}</p></div>{locked ? <span className="rm-selected-label">{captainId === player.id ? '★ Captain' : 'Flex'}</span> : <div className="rm-player-actions"><button aria-label={`Captain ${player.name}`} aria-pressed={captainId === player.id} disabled={busy} onClick={() => change(player.id, true)}>{captainId === player.id ? '★ Captain' : '☆ Captain'}</button><button aria-label={`${flexIds.includes(player.id) ? 'Remove' : 'Add'} ${player.name}`} aria-pressed={flexIds.includes(player.id)} disabled={busy} onClick={() => change(player.id, false)}>{flexIds.includes(player.id) ? '✓ Flex' : '+ Flex'}</button></div>}</article>)}</div>{!locked && <div className="rm-save"><button className="rm-primary" disabled={busy || !captainId || flexIds.length !== view.rules.flexSlots || salary > view.rules.salaryCap} onClick={async () => { const fresh = await onSave({ captainId, flexIds }); if (fresh) apply(fresh); }}>{busy ? 'Saving…' : 'Save lineup'}</button><span role="status">{saved ? 'Saved. You’re set for kickoff.' : 'Not saved yet'}</span></div>}</section>;
}
