import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { liveFixture } from '../lib/fixtures';

const STEPS = [
  { title: 'Lineup', text: 'Choose a captain and four flex players within the salary cap.', number: '01' },
  { title: 'Picks', text: 'Choose how each drive will end before picks close.', number: '02' },
  { title: 'Results', text: 'Track your points and compare tonight’s finish with the season.', number: '03' },
];

export function WelcomePage() {
  const leader = liveFixture.standings.find((row) => row.rank === 1);
  return <main className="home-welcome">
    <header className="home-header"><Link to="/" aria-label="Benchwarmers home"><BrandLockup size={30} /></Link><Link className="home-header-link" to="/">Game night <span aria-hidden="true">→</span></Link></header>
    <div className="home-intro">
      <section className="home-hero">
        <span className="home-eyebrow">How to play</span>
        <h1>Game night,<br /><span>together.</span></h1>
        <p>Build a lineup. Make picks during a football replay. See where you finish.</p>
        <div className="home-actions"><Link className="home-primary" to="/">Create or join a room <span aria-hidden="true">→</span></Link><a className="home-secondary" href="/tv/DEMO?fixture=live">Try party demo <span aria-hidden="true">→</span></a></div>
        <p className="home-disclosure">Free to play. Fictional teams and players.</p>
      </section>
      <aside className="home-scorebook" aria-label="Basketball party demo">
        <div className="home-scorebook-top"><span>Party demo</span><span>Basketball replay</span></div>
        <h2>{liveFixture.party.crewName}</h2>
        <div className="home-sample-team"><span>{liveFixture.game.away.name}</span><b>{liveFixture.game.away.score}</b></div>
        <div className="home-sample-team"><span>{liveFixture.game.home.name}</span><b>{liveFixture.game.home.score}</b></div>
        <p className="home-sample-clock">{liveFixture.game.clock}</p>
        {leader && <div className="home-sample-leader"><span>Leader</span><strong>{leader.name}<b>{leader.total.toFixed(1)} <small>pts</small></b></strong></div>}
        <p className="home-disclosure">The legacy party demo uses three-player rosters. Its codes are separate from football rooms.</p>
      </aside>
    </div>
    <section className="home-previews" aria-labelledby="how-title">
      <header><h2 id="how-title">Football room</h2><span>From lineup to final</span></header>
      <div className="home-preview-grid">{STEPS.map((step) => <article key={step.number}><span className="home-step">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
    </section>
    <footer className="home-footer"><Link to="/">Game night</Link><span>Free to play · Fictional replay</span></footer>
  </main>;
}
