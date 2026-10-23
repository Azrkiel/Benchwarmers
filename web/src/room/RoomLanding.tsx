import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RoomView } from '@shared/room';
import { errorMessage, forgetSeasonToken, rememberPlayer, RoomRequestError, roomRequest, saveCredentials, seasonToken, storageWarning, type RoomCredentials } from './api';
import { GAME_CHOICES, roomSport, type GameChoice } from './sport';
import './room.css';

export function JoinRoom({ code, seasonId, phase = 'lobby', initialName = '', onJoin }: { code: string; seasonId: string; phase?: RoomView['room']['phase']; initialName?: string; onJoin: (view: RoomView, credentials: RoomCredentials) => void }) {
  const [name, setName] = useState(initialName.slice(0, 24));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [freshSeat, setFreshSeat] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function join(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || busy) return;
    controller.current = new AbortController(); setBusy(true); setError('');
    try {
      const result = await roomRequest<{ view: RoomView; participantToken: string }>(`/api/rooms/${encodeURIComponent(code)}/join`, { body: { name: name.trim(), participantToken: seasonToken(seasonId) }, signal: controller.current.signal });
      if (controller.current.signal.aborted) return;
      onJoin(result.view, rememberPlayer(code, result.view, result.participantToken));
    } catch (problem) {
      if (!controller.current.signal.aborted) {
        if (problem instanceof RoomRequestError && problem.status === 401 && seasonToken(seasonId)) {
          forgetSeasonToken(seasonId); setFreshSeat(true);
          setError('Join as a new player. Your previous season history will not link to this one.');
        } else setError(errorMessage(problem));
      }
    }
    finally { if (!controller.current?.signal.aborted) setBusy(false); }
  }
  return <form className="rm-join" onSubmit={join}><h2>Join room</h2><p>{phase === 'lobby' ? 'Choose five players, then make picks during the game.' : phase === 'final' ? 'The game has ended. Joining adds an automatic lineup; you cannot make picks.' : 'The game has started. You’ll receive a locked automatic lineup and can make picks when play resumes.'}</p><label htmlFor="rm-name">Your name</label><input id="rm-name" value={name} maxLength={24} autoComplete="nickname" onChange={(event) => setName(event.target.value)} placeholder="Name, up to 24 characters" required aria-invalid={!!error} aria-describedby={error ? 'rm-join-error' : undefined} /><button className="rm-primary" disabled={busy || !name.trim()}>{busy ? 'Joining…' : freshSeat ? 'Join as new player' : 'Join room'}</button>{error && <p id="rm-join-error" role="alert" className="rm-error">{error}</p>}</form>;
}

export const ROOM_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;
export const cleanRoomCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

/** Host form: room name plus an explicit game choice. Basketball is the default for new parties. */
export function HostRoomForm({ onCancel }: { onCancel?: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('Friday watch party');
  const [choice, setChoice] = useState<GameChoice['id']>('basketball');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fallbackCode, setFallbackCode] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function create(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const game = GAME_CHOICES.find((item) => item.id === choice)!;
    controller.current = new AbortController(); setBusy(true); setError(''); setFallbackCode('');
    try {
      const result = await roomRequest<{ view: RoomView; hostToken: string }>('/api/rooms', { body: { name: name.trim() || undefined, ...(game.gameId ? { gameId: game.gameId } : {}) }, signal: controller.current.signal });
      if (controller.current.signal.aborted) return;
      const code = result.view.room.code;
      saveCredentials(code, { hostToken: result.hostToken });
      // An older server ignores gameId and still creates football. Say so instead of
      // dropping the host into the wrong sport.
      if (game.id !== roomSport(result.view)) { setFallbackCode(code); return; }
      navigate(`/room/${code}`);
    } catch (problem) { if (!controller.current.signal.aborted) setError(errorMessage(problem)); }
    finally { if (!controller.current?.signal.aborted) setBusy(false); }
  }
  return <form className="rm-host-form" onSubmit={create} aria-label="Host a party">
    <fieldset className="rm-game-choice"><legend>Game</legend>
      {GAME_CHOICES.map((game) => <label key={game.id} className={choice === game.id ? 'is-selected' : ''}>
        <input type="radio" name="rm-game" value={game.id} checked={choice === game.id} onChange={() => setChoice(game.id)} />
        <span><b>{game.label}</b><small>{game.detail}</small><small className="rm-source">{game.source}</small></span>
      </label>)}
    </fieldset>
    <label htmlFor="rm-room-name">Party name <span className="rm-muted">(optional)</span></label>
    <input id="rm-room-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
    <div className="rm-form-actions"><button className="rm-primary" disabled={busy}>{busy ? 'Creating…' : 'Create party'}</button>{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}</div>
    {error && <p role="alert" className="rm-error">{error}</p>}
    {fallbackCode && <p role="alert" className="rm-error">This server can't host basketball yet, so it made a football room. <Link to={`/room/${fallbackCode}`}>Open {fallbackCode}</Link></p>}
    {storageWarning() && <p className="rm-muted">{storageWarning()}</p>}
  </form>;
}

/** Join form: code plus display name. The name prefills the room's join step. */
export function JoinCodeForm({ initialCode = '', onCancel }: { initialCode?: string; onCancel?: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(cleanRoomCode(initialCode));
  const [name, setName] = useState('');
  function join(event: FormEvent) {
    event.preventDefault();
    if (!ROOM_CODE_PATTERN.test(code)) return;
    navigate(`/room/${encodeURIComponent(code)}`, { state: { joinName: name.trim() } });
  }
  return <form className="rm-join-form" onSubmit={join} aria-label="Join a party">
    <label htmlFor="rm-code">Party code</label>
    <input id="rm-code" autoCapitalize="characters" autoComplete="off" value={code} maxLength={12} onChange={(event) => setCode(cleanRoomCode(event.target.value))} placeholder="ABC123" required />
    <label htmlFor="rm-join-name">Your name</label>
    <input id="rm-join-name" value={name} maxLength={24} autoComplete="nickname" onChange={(event) => setName(event.target.value)} placeholder="Up to 24 characters" />
    <div className="rm-form-actions"><button className="rm-primary" disabled={!code}>Join party</button>{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}</div>
  </form>;
}
