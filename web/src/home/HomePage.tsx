import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { PullUpGame } from './PullUpGame';
import { RoomLanding } from '../room/RoomLanding';
import './home.css';

const DEMOS = [
  { to: '/tv/DEMO?fixture=live', title: 'TV view', sub: 'Three-player party demo' },
  { to: '/device/garcias', title: 'The Garcias', sub: 'Device simulator · Maya and Leo' },
  { to: '/device/sams-place', title: "Sam's Place", sub: 'Device simulator · Sam and Priya' },
  { to: '/display/garcias', title: 'Smart display', sub: 'Simulated screen · add ?clean=1 to record' },
  { to: '/voice-lab', title: 'Voice setup lab', sub: 'Recognition and diagnostics' },
  { to: '/lounge/DEMO?fixture=live', title: 'Lounge layout preview', sub: 'Alternate TV layout' },
  { to: '/tv2/DEMO?fixture=live', title: 'TV layout preview', sub: 'Alternate broadcast layout' },
  { to: '/watch/DEMO?fixture=live', title: 'Watch preview', sub: 'Video with replay data' },
  { to: '/control/latest', title: 'Overlay controls', sub: 'Legacy party controls' },
  { to: '/welcome', title: 'Welcome preview', sub: 'How to play' },
];

function PlayDiagram() {
  return <div className="hm-play-diagram" aria-hidden="true">
    <svg viewBox="0 0 440 180" fill="none">
      <path className="hm-diagram-grid" d="M20 20H420V160H20ZM100 20V160M180 20V160M260 20V160M340 20V160M20 90H420" />
      <path className="hm-diagram-route" pathLength="1" d="M65 132H150Q180 132 198 112L270 48H365" />
      <path className="hm-diagram-arrow" d="M351 36L366 48L351 60" />
      <circle className="hm-diagram-start" cx="65" cy="132" r="8" />
      <path className="hm-diagram-defense" d="M105 48L121 64M121 48L105 64M257 125L273 141M273 125L257 141M339 102L355 118M355 102L339 118" />
    </svg>
  </div>;
}

export function HomePage() {
  return <main className="hm">
    <header className="hm-topbar">
      <Link to="/" aria-label="Benchwarmers home"><BrandLockup size={30} /></Link>
      <Link className="hm-help" to="/welcome">How to play <span aria-hidden="true">→</span></Link>
    </header>
    <section className="hm-main">
      <header className="hm-header"><div><span className="hm-eyebrow">Fantasy + picks</span><h1>Game night</h1><p>Create a football room or join your friends.</p></div><PlayDiagram /></header>
      <div id="room-start"><RoomLanding /></div>
      <PullUpGame />
      <details className="hm-demos">
        <summary>Demo tools</summary>
        <p className="hm-demo-note">Explore the three-player party demo and alternate layouts. Party codes are separate from football room codes.</p>
        <nav className="hm-more" aria-label="Demo tools">
          {DEMOS.map((demo) => <a key={demo.to} className="hm-more-link" href={demo.to}>
            <span><b>{demo.title}</b><small>{demo.sub}</small></span><span aria-hidden="true">→</span>
          </a>)}
        </nav>
      </details>
    </section>
    <footer className="hm-footer"><span>Free to play · Fictional football replay</span><span>Benchwarmers</span></footer>
  </main>;
}
