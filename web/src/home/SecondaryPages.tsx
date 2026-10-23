import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { savedRooms } from '../room/api';
import { cleanRoomCode } from '../room/RoomLanding';
import { HomeFooter, HomeNav } from './HomeNav';
import { PullUpGame } from './PullUpGame';
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
];

function Shell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <main className="hm hm-secondary">
    <HomeNav />
    <section className="hm-page" aria-labelledby="hm-page-title"><span className="hm-eyebrow">{eyebrow}</span><h1 id="hm-page-title">{title}</h1>{children}</section>
    <HomeFooter />
  </main>;
}

export function ReplaysPage() {
  return <Shell title="Replays" eyebrow="Completed games"><PullUpGame /></Shell>;
}

/** Developer and legacy previews, kept reachable but out of the primary journey. */
export function ToolsPage() {
  return <Shell title="Demo tools" eyebrow="For builders">
    <p className="hm-demo-note">Simulators and alternate layouts. Party codes here are separate from game-night rooms.</p>
    <nav className="hm-more" aria-label="Demo tools">
      {DEMOS.map((demo) => <a key={demo.to} className="hm-more-link" href={demo.to}><span><b>{demo.title}</b><small>{demo.sub}</small></span><span aria-hidden="true">→</span></a>)}
    </nav>
  </Shell>;
}

/** Season standings belong to a room's season; without a saved seat, ask which room. */
export function SeasonPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const rooms = savedRooms();
  function open(event: FormEvent) { event.preventDefault(); if (code) navigate(`/room/${code}?view=season`); }
  return <Shell title="Season" eyebrow="Standings">
    <p className="hm-demo-note">Season totals live with your party. {rooms.length ? 'Open one of your rooms or enter a code.' : 'Enter your party code to see them.'}</p>
    {rooms.length > 0 && <ul className="hm-rooms" aria-label="Your rooms">{rooms.map((room) => <li key={room.code}><Link to={`/room/${room.code}?view=season`}><b>{room.code}</b><small>{room.seated ? 'Your seat' : 'Host'}</small></Link></li>)}</ul>}
    <form className="hm-season-form" onSubmit={open}><label htmlFor="hm-season-code">Party code</label><div><input id="hm-season-code" value={code} maxLength={12} autoCapitalize="characters" autoComplete="off" onChange={(event) => setCode(cleanRoomCode(event.target.value))} /><button disabled={!code}>Open season</button></div></form>
  </Shell>;
}
