import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { TvPage } from './tv/TvPage';
import { DevicePage } from './device/DevicePage';
import { VoiceLabPage } from './voiceid/VoiceLabPage';

function Home() {
  return (
    <main className="home">
      <h1>Benchwarmers</h1>
      <p>One-night fantasy draft + live pick'em for watching games with friends.</p>
      <ul>
        <li><Link to="/device/garcias">Austin device (The Garcias)</Link></li>
        <li><Link to="/device/sams-place">Seattle device (Sam's Place)</Link></li>
        <li><Link to="/tv/DEMO">TV view (party DEMO)</Link></li>
        <li><Link to="/voice-lab">Voice ID lab</Link></li>
      </ul>
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
