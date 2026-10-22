import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { TvPage } from './tv/TvPage';
import { DevicePage } from './device/DevicePage';
import { VoiceLabPage } from './voiceid/VoiceLabPage';
import { liveFixture } from './lib/fixtures';

function Home() {
  const leader = liveFixture.standings.find((row) => row.rank === 1);
  return (
    <main className="home home-welcome">
      <header className="home-header"><span className="home-brand"><span aria-hidden="true">bw</span>Benchwarmers</span><span className="home-tag">Your crew. Your game night.</span></header>
      <div className="home-intro"><section className="home-hero">
        <span className="home-eyebrow">Good company. Friendly competition.</span>
        <h1>Same game.<br /><span>Your rivalry.</span></h1>
        <p>Draft your players. Call the next play. See who earns the bragging rights, one game night at a time.</p>
        <div className="home-actions"><Link className="home-primary" to="/tv/latest">Open game night <span aria-hidden="true">↗</span></Link><Link className="home-secondary" to="/tv/DEMO?fixture=live">Explore the demo <span aria-hidden="true">→</span></Link></div>
        <span className="home-helper">Game night opens your crew’s current party. The demo uses sample data.</span>
      </section>
      <aside className="home-scorebook" aria-label="Sample game-night scorebook">
        <div className="home-scorebook-top"><span>Inside the demo</span><span>Sample game</span></div>
        <h2>{liveFixture.party.crewName}</h2>
        <div className="home-sample-team"><span>{liveFixture.game.home.name}</span><b>{liveFixture.game.home.score}</b></div>
        <div className="home-sample-team"><span>{liveFixture.game.away.name}</span><b>{liveFixture.game.away.score}</b></div>
        <div className="home-sample-clock">{liveFixture.game.clock}<span>Draft + picks = bragging rights</span></div>
        {leader ? <div className="home-sample-leader"><span>Leading the crew</span><strong>{leader.name}<b>{leader.total.toFixed(1)} <span>pts</span></b></strong></div> : null}
      </aside></div>
      <section className="home-previews" aria-labelledby="preview-title">
        <header><h2 id="preview-title">From first pick to final whistle.</h2><span>Take a look around the demo</span></header>
        <div className="home-preview-grid">
          <Link to="/tv/DEMO?fixture=drafting&mode=draft"><span className="home-step">01 <span>Before tip-off</span></span><h3>Build your bench.</h3><p>Find your favorites and see who your friends draft.</p><span className="home-card-action">Preview the draft <span aria-hidden="true">↗</span></span></Link>
          <Link to="/tv/DEMO?fixture=live"><span className="home-step">02 <span>Every play counts</span></span><h3>Get in the game.</h3><p>Follow the score, the next call, and your crew’s friendly rivalry.</p><span className="home-card-action">Preview game night <span aria-hidden="true">↗</span></span></Link>
          <Link to="/tv/DEMO?fixture=final&mode=final"><span className="home-step">03 <span>After the buzzer</span></span><h3>Claim the night.</h3><p>Celebrate the winner, relive the highlights, and check the season.</p><span className="home-card-action">Preview the results <span aria-hidden="true">↗</span></span></Link>
        </div>
      </section>
      <footer className="home-footer"><span>Made for the game. Better with your crew.</span><span>Benchwarmers</span></footer>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tv/:code" element={<TvPage />} />
        <Route path="/device/:household" element={<DevicePage />} />
        <Route path="/voice-lab" element={<VoiceLabPage />} />
      </Routes>
    </BrowserRouter>
  );
}
