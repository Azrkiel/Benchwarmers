import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { PullUpGame } from './PullUpGame';
import './home.css';

const ICONS = {
  speaker: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm5 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-3.5h.01',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

type Card = { to: string; title: string; sub: string; detail?: string; icon: keyof typeof ICONS; reload?: boolean; feature?: boolean };

// TV-style routes use a full load (plain <a>) so their stylesheets never share a page.
const MAIN: Card[] = [
  { to: '/device/garcias', title: 'Austin device', sub: 'The Garcias', detail: 'Maya and Leo', icon: 'speaker' },
  { to: '/device/sams-place', title: 'Seattle device', sub: "Sam's Place", detail: 'Sam and Priya', icon: 'speaker' },
  { to: '/tv/DEMO', title: 'TV view', sub: 'Party DEMO', detail: 'The big screen for game night', icon: 'tv', reload: true, feature: true },
  { to: '/voice-lab', title: 'Voice ID lab', sub: "Who's talking", detail: 'Enroll voices and tune matching', icon: 'mic' },
];

const MORE: Card[] = [
  { to: '/lounge/DEMO', title: 'Lounge', sub: 'Party DEMO', icon: 'tv', reload: true },
  { to: '/tv2/DEMO', title: 'Scorebook TV', sub: 'Party DEMO', icon: 'tv', reload: true },
  { to: '/watch/DEMO', title: 'YouTube overlay', sub: 'Preview', icon: 'tv', reload: true },
  { to: '/control/latest', title: 'Overlay control', sub: 'Drives the extension', icon: 'tv', reload: true },
  { to: '/welcome', title: 'Scorebook welcome', sub: 'Landing page', icon: 'tv', reload: true },
];

function CardLink({ card, className, children }: { card: Card; className: string; children: ReactNode }) {
  return card.reload ? <a className={className} href={card.to}>{children}</a> : <Link className={className} to={card.to}>{children}</Link>;
}

export function HomePage() {
  return (
    <main className="hm">
      <aside className="hm-side">
        <BrandLockup size={52} stacked />
        <p className="hm-tagline">One-night fantasy draft + live pick'em for watching games with friends.</p>
        <div className="hm-party"><span>Demo party</span><b>DEMO</b></div>
      </aside>
      <section className="hm-main">
        <header className="hm-header"><span>Sunday Crew</span><h1>Game night</h1></header>
        <PullUpGame />
        <div className="hm-grid">
          {MAIN.map((card) => (
            <CardLink key={card.to} card={card} className={`hm-card${card.feature ? ' is-feature' : ''}`}>
              <span className="hm-card-top"><span className="hm-card-icon"><Icon name={card.icon} /></span><span className="hm-card-arrow"><Icon name="arrow" /></span></span>
              <span className="hm-card-title">{card.title}</span>
              <span className="hm-card-sub">{card.sub}</span>
              <span className="hm-card-detail">{card.detail}</span>
            </CardLink>
          ))}
        </div>
        <h2 className="hm-more-title">More views</h2>
        <div className="hm-more">
          {MORE.map((card) => (
            <CardLink key={card.to} card={card} className="hm-more-link">
              <span><b>{card.title}</b><small>{card.sub}</small></span><Icon name="arrow" />
            </CardLink>
          ))}
        </div>
      </section>
    </main>
  );
}
