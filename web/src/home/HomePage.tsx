import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { PullUpGame } from './PullUpGame';
import { RoomLanding } from '../room/RoomLanding';
import './home.css';

const DEMOS = [
  { to: '/tv/DEMO?fixture=live', title: 'TV view', sub: 'Three-player party demo' },
  { to: '/device/garcias', title: 'The Garcias', sub: 'Device simulator · Maya and Leo' },
  { to: '/device/sams-place', title: "Sam's Place", sub: 'Device simulator · Sam and Priya' },
  { to: '/voice-lab', title: 'Voice setup lab', sub: 'Recognition and diagnostics' },
  { to: '/lounge/DEMO?fixture=live', title: 'Lounge layout preview', sub: 'Alternate TV layout' },
  { to: '/tv2/DEMO?fixture=live', title: 'TV layout preview', sub: 'Alternate broadcast layout' },
  { to: '/watch/DEMO?fixture=live', title: 'Watch preview', sub: 'Video with replay data' },
  { to: '/control/latest', title: 'Overlay controls', sub: 'Legacy party controls' },
  { to: '/welcome', title: 'Welcome preview', sub: 'How to play' },
];

export function HomePage() {
  return <main className="hm">
    <header className="hm-topbar">
      <Link to="/" aria-label="Benchwarmers home"><BrandLockup size={30} /></Link>
      <Link className="hm-help" to="/welcome">How to play <span aria-hidden="true">→</span></Link>
    </header>
    <section className="hm-main">
      <header className="hm-header"><span className="hm-eyebrow">Fantasy + picks</span><h1>Game night</h1><p>Create a football room or join your friends.</p></header>
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
