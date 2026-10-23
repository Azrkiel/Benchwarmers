import { Component, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';

function destination(path: string): string {
  if (/^\/room\/[^/]+\/tv\/?$/.test(path) || /^\/tv2?\//.test(path)) return 'TV view';
  const pages: Record<string, string> = { room: 'Football room', welcome: 'How to play', lounge: 'Lounge preview', watch: 'Watch preview', control: 'Overlay controls', device: 'Device', display: 'Smart display (simulated)', 'voice-lab': 'Voice setup lab' };
  return pages[path.split('/')[1]] ?? 'Game night';
}

export function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = `${destination(pathname)} · Benchwarmers`; }, [pathname]);
  return null;
}

export function RouteLoading() {
  const { pathname } = useLocation();
  return <main className="route-status"><BrandLockup size={30} /><p role="status">Opening {destination(pathname)}…</p></main>;
}

export function NotFound() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  function open(event: FormEvent) { event.preventDefault(); if (code.trim()) navigate(`/room/${encodeURIComponent(code.trim())}`); }
  return <main className="route-status">
    <Link to="/" aria-label="Benchwarmers home"><BrandLockup size={30} /></Link>
    <span className="route-kicker">404</span><h1>Page not found</h1><p>Return to game night or open a football room with its code.</p>
    <form onSubmit={open}><label htmlFor="missing-code">Room code</label><div><input id="missing-code" value={code} maxLength={12} autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /><button disabled={!code.trim()}>Open room</button></div></form>
    <Link to="/">Game night</Link>
  </main>;
}

export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="route-status"><BrandLockup size={30} /><h1>Page unavailable</h1><p role="alert">The page couldn't open. Try loading it again.</p><button onClick={() => window.location.reload()}>Try again</button><a href="/">Game night</a></main>;
  }
}
