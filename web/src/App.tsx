import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { DevicePage } from './device/DevicePage';
import { VoiceLabPage } from './voiceid/VoiceLabPage';
import { liveFixture } from './lib/fixtures';
import { useScorebookTheme } from './lib/theme';

// The two TV designs share class names, so each loads in its own route chunk.
const TvPage = lazy(() => import('./tv/TvPage').then((m) => ({ default: m.TvPage })));
const BroadcastTvPage = lazy(() => import('./tv-broadcast/TvPage').then((m) => ({ default: m.TvPage })));
const LoungePage = lazy(() => import('./lounge/LoungePage').then((m) => ({ default: m.LoungePage })));
const WatchPage = lazy(() => import('./watch/WatchPage').then((m) => ({ default: m.WatchPage })));
const ControlPage = lazy(() => import('./control/ControlPage').then((m) => ({ default: m.ControlPage })));

function Home() {
  // Plain <a> for the TV-style routes: a full load keeps the two TV stylesheets apart.
  return (
    <main className="home">
      <h1>Benchwarmers</h1>
      <p>One-night fantasy draft + live pick'em for watching games with friends.</p>
      <ul>
        <li><Link to="/device/garcias">Austin device (The Garcias)</Link></li>
        <li><Link to="/device/sams-place">Seattle device (Sam's Place)</Link></li>
        <li><a href="/tv/DEMO">TV view (party DEMO)</a></li>
        <li><Link to="/voice-lab">Voice ID lab</Link></li>
      </ul>
      <h2>Scorebook redesign</h2>
      <ul>
        <li><a href="/welcome">Welcome page</a></li>
        <li><a href="/tv2/DEMO">TV view, scorebook version (party DEMO)</a></li>
        <li><a href="/lounge/DEMO">Lounge (party DEMO)</a></li>
        <li><a href="/watch/DEMO">YouTube overlay preview (party DEMO)</a></li>
        <li><a href="/control/latest">Overlay control page (drives the YouTube extension)</a></li>
      </ul>
    </main>
  );
}

function Welcome() {
  useScorebookTheme();
  const leader = liveFixture.standings.find((row) => row.rank === 1);
  return (
    <main className="home home-welcome">
      <header className="home-header"><span className="home-brand"><span aria-hidden="true">bw</span>Benchwarmers</span><span className="home-tag">Your crew. Your game night.</span></header>
      <div className="home-intro"><section className="home-hero">
        <span className="home-eyebrow">Good company. Friendly competition.</span>
        <h1>Same game.<br /><span>Your rivalry.</span></h1>
        <p>Draft your players. Call the next play. See who earns the bragging rights, one game night at a time.</p>
        <div className="home-actions"><Link className="home-primary" to="/tv2/latest">Open game night <span aria-hidden="true">↗</span></Link><Link className="home-secondary" to="/tv2/DEMO?fixture=live">Explore the demo <span aria-hidden="true">→</span></Link></div>
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
          <Link to="/tv2/DEMO?fixture=drafting&mode=draft"><span className="home-step">01 <span>Before tip-off</span></span><h3>Build your bench.</h3><p>Find your favorites and see who your friends draft.</p><span className="home-card-action">Preview the draft <span aria-hidden="true">↗</span></span></Link>
          <Link to="/tv2/DEMO?fixture=live"><span className="home-step">02 <span>Every play counts</span></span><h3>Get in the game.</h3><p>Follow the score, the next call, and your crew’s friendly rivalry.</p><span className="home-card-action">Preview game night <span aria-hidden="true">↗</span></span></Link>
          <Link to="/tv2/DEMO?fixture=final&mode=final"><span className="home-step">03 <span>After the buzzer</span></span><h3>Claim the night.</h3><p>Celebrate the winner, relive the highlights, and check the season.</p><span className="home-card-action">Preview the results <span aria-hidden="true">↗</span></span></Link>
        </div>
      </section>
      <footer className="home-footer"><span>Made for the game. Better with your crew.</span><span>Benchwarmers</span></footer>
    </main>
  );
}

function Scorebook({ children }: { children: ReactNode }) {
  useScorebookTheme();
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/tv/:code" element={<TvPage />} />
          <Route path="/tv2/:code" element={<Scorebook><BroadcastTvPage /></Scorebook>} />
          <Route path="/lounge/:code" element={<Scorebook><LoungePage /></Scorebook>} />
          <Route path="/watch/:code" element={<Scorebook><WatchPage /></Scorebook>} />
          <Route path="/control/:code" element={<Scorebook><ControlPage /></Scorebook>} />
          <Route path="/device/:household" element={<DevicePage />} />
          <Route path="/voice-lab" element={<VoiceLabPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
