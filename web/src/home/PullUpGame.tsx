import { useId, useState, type FormEvent } from 'react';
import { api } from '../lib/api';

type Imported = { game: { id: string; title: string }; cached: boolean };

/** Where to send the browser; injectable so tests don't navigate jsdom. */
export type Navigate = (url: string) => void;
const hardNavigate: Navigate = (url) => window.location.assign(url);

const CREW = 'sunday-crew';
const HOUSEHOLDS = ['garcias', 'sams-place'];

/**
 * "Pull up a game": type a matchup, the server fetches the real game, we make a party for the crew and open the TV.
 * TV routes load a full page (their stylesheets never share a page), so we navigate rather than route.
 */
export function PullUpGame({ navigate = hardNavigate }: { navigate?: Navigate }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    setCode('');
    try {
      setStatus('Finding the game…');
      const imported = await api.post<Imported>('/games/import', { query: q });
      setStatus('Building rosters…');
      const party = await api.post<{ code: string }>('/parties', { crewId: CREW, gameId: imported.game.id });
      setStatus('Starting your party…');
      for (const householdId of HOUSEHOLDS) await api.post(`/parties/${party.code}/join`, { householdId });
      setCode(party.code);
      setStatus(`${imported.game.title} is ready. Opening the TV…`);
      navigate(`/tv/${party.code}`);
    } catch (err) {
      setStatus('');
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <section className="hm-pull" aria-labelledby={`${inputId}-title`}>
      <div className="hm-pull-copy">
        <h2 id={`${inputId}-title`}>Pull up a game</h2>
        <p>Replay any finished game with the crew.</p>
      </div>
      <form className="hm-pull-form" onSubmit={submit}>
        <label htmlFor={inputId}>Which game?</label>
        <div className="hm-pull-row">
          <input
            id={inputId}
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="UVA vs FSU 2025"
            autoComplete="off"
            disabled={busy}
            aria-describedby={`${inputId}-status`}
          />
          <button type="submit" disabled={busy || !query.trim()}>
            {busy ? 'Working…' : 'Pull it up'}
          </button>
        </div>
        <div id={`${inputId}-status`} className="hm-pull-status" role="status" aria-live="polite">
          {error ? <span className="hm-pull-error">{error}</span> : status}
          {code && (
            <>
              {' '}
              <a href={`/lounge/${code}`}>Open the Lounge for {code}</a>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
