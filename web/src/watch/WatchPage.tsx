import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import './watch.css';

const DEMO_VIDEO = 'lsZDzZbO_aY';
const PANELS = ['live', 'picks', 'standings', 'rosters', 'draft'] as const;
const LABELS = ['Game', 'Picks', 'Standings', 'Rosters', 'Draft'];
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.split('/')[1]
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
        ? url.pathname === '/watch' ? url.searchParams.get('v')
          : /^\/(live|embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
        : null;
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Isolated composition experiment. The video and game feed are independent. */
export function WatchPage() {
  const { code = 'DEMO' } = useParams();
  const [params] = useSearchParams();
  const fixture = params.get('fixture');
  const [video, setVideo] = useState(youtubeId(params.get('video') || '') || DEMO_VIDEO);
  const [source, setSource] = useState(`https://www.youtube.com/watch?v=${video}`);
  const [mode, setMode] = useState<(typeof PANELS)[number]>('live');
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState('');
  const player = useRef<HTMLDivElement>(null);
  const overlayParams = new URLSearchParams({ controls: '0' });
  if (fixture) overlayParams.set('fixture', fixture);
  if (params.get('crew')) overlayParams.set('crew', params.get('crew')!);
  overlayParams.set('mode', mode);
  const overlayUrl = `/tv2/${encodeURIComponent(code)}?${overlayParams}`;
  return (
    <main className="watch-page">
      <header className="watch-header"><Link to="/">Benchwarmers</Link><span>Streaming overlay / preview</span><Link to={`/lounge/${encodeURIComponent(code)}${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ''}`}>Lounge ↗</Link></header>
      <div className="watch-player" ref={player} onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'BrowserBack') { setMode('live'); }
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !(event.target instanceof HTMLButtonElement)) return;
        const buttons = [...player.current!.querySelectorAll<HTMLButtonElement>('.watch-dock button')];
        const index = buttons.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))]?.focus();
      }}>
        <iframe key={video} className="watch-video" title="YouTube video" src={`https://www.youtube.com/embed/${video}?playsinline=1&rel=0&fs=0`} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
        <iframe className="watch-overlay" title="Benchwarmers overlay" src={overlayUrl} tabIndex={-1} hidden={!visible} />
        <span className="watch-sample">{fixture ? 'Sample scores · Not synced to video' : 'Party feed · Video timing is independent'}</span>
        <nav className="watch-dock" aria-label="Overlay controls">
          {PANELS.map((panel, i) => <button key={panel} type="button" aria-pressed={mode === panel} disabled={!visible} onClick={() => setMode((current) => current === panel ? 'live' : panel)}>{LABELS[i]}</button>)}
          <button type="button" aria-label="Show overlay" aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? 'Hide overlay' : 'Show overlay'}</button>
          <button type="button" onClick={() => {
            const action = document.fullscreenElement ? document.exitFullscreen() : player.current?.requestFullscreen();
            action?.catch(() => setError('Fullscreen is unavailable here. You can still watch in this page.'));
          }}>Fullscreen</button>
        </nav>
      </div>
      <section className="watch-setup" aria-label="Video source">
        <div><h1>The game, with your crew on top.</h1><p>Use the controls above to open a panel. Fullscreen keeps the video and overlay together.</p><p>{fixture ? 'Sample scores are not synced to this video.' : 'The party feed does not synchronize video playback.'} This preview uses an embedded YouTube player.</p></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          const next = youtubeId(source);
          if (!next) { setError('Paste a YouTube video link. Other streaming sites need a separate integration.'); return; }
          setError(''); setVideo(next);
        }}>
          <label htmlFor="watch-source">YouTube link</label><div className="watch-source-row"><input id="watch-source" value={source} onChange={(event) => setSource(event.target.value)} /><button type="submit">Load video</button></div>
          <p>If playback is unavailable, <a href={`https://www.youtube.com/watch?v=${video}`} target="_blank" rel="noreferrer">open the source on YouTube ↗</a> or try another link.</p>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
