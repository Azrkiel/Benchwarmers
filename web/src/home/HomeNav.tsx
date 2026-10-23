import { Link, NavLink } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';

const LINKS = [
  { to: '/', label: 'Play', end: true },
  { to: '/welcome', label: 'How it works', end: false },
  { to: '/season', label: 'Season', end: false },
];

/** Top navigation shared by the homepage and its secondary destinations. */
export function HomeNav() {
  return <header className="hm-topbar">
    <Link to="/" className="hm-brand" aria-label="Benchwarmers home"><BrandLockup size={26} /></Link>
    <nav className="hm-nav" aria-label="Main">
      {LINKS.map((link) => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `hm-nav-link${isActive ? ' is-active' : ''}`}>{link.label}</NavLink>)}
    </nav>
  </header>;
}

/** Small footer that keeps secondary destinations reachable without crowding the hero. */
export function HomeFooter() {
  return <footer className="hm-footer">
    <span>Free to play · Fictional replays</span>
    <nav aria-label="More">
      <Link to="/replays">Replay a real game</Link>
      <Link to="/tools">Demo tools</Link>
    </nav>
  </footer>;
}
