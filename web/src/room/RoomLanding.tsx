import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomView } from '@shared/room';
import { errorMessage, forgetSeasonToken, rememberPlayer, RoomRequestError, roomRequest, saveCredentials, seasonToken, storageWarning, type RoomCredentials } from './api';
import './room.css';

export function JoinRoom({ code, seasonId, phase = 'lobby', onJoin }: { code: string; seasonId: string; phase?: RoomView['room']['phase']; onJoin: (view: RoomView, credentials: RoomCredentials) => void }) {
  const [name, setName] = useState('');
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

export function RoomLanding() {
  const navigate = useNavigate();
  const [name, setName] = useState('Sunday watch party');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function create(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    controller.current = new AbortController(); setBusy(true); setError('');
    try {
      const result = await roomRequest<{ view: RoomView; hostToken: string }>('/api/rooms', { body: { name: name.trim() || undefined }, signal: controller.current.signal });
      if (controller.current.signal.aborted) return;
      saveCredentials(result.view.room.code, { hostToken: result.hostToken });
      navigate(`/room/${result.view.room.code}`);
    } catch (problem) { if (!controller.current.signal.aborted) setError(errorMessage(problem)); }
    finally { if (!controller.current?.signal.aborted) setBusy(false); }
  }
  return <section className="rm-landing" aria-labelledby="rm-landing-title"><div className="rm-landing-copy"><span className="rm-eyebrow">Football · Replay</span><h2 id="rm-landing-title">Create or join a room</h2><p>Five-player lineups. Picks on every drive. Follow the standings together.</p></div><div className="rm-landing-forms"><form onSubmit={create}><label htmlFor="rm-room-name">Room name</label><input id="rm-room-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /><button className="rm-primary" disabled={busy}>{busy ? 'Creating…' : 'Create room'}</button></form><form onSubmit={(event) => { event.preventDefault(); if (code.trim()) navigate(`/room/${encodeURIComponent(code.trim().toUpperCase())}`); }}><label htmlFor="rm-code">Room code</label><div className="rm-input-row"><input id="rm-code" autoCapitalize="characters" autoComplete="off" value={code} maxLength={12} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Enter code" required /><button disabled={!code.trim()}>Join room</button></div></form>{error && <p role="alert" className="rm-error">{error}</p>}{storageWarning() && <p className="rm-muted">{storageWarning()}</p>}</div></section>;
}
