import { useState } from 'react';
import type { PartyStateResponse, StandingRow } from '@shared/types';

export type LoungeView = 'tonight' | 'picks' | 'crew' | 'draft' | 'final';

const PATHS: Record<LoungeView | 'back' | 'close' | 'arrow', string> = {
  tonight: 'M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10',
  picks: 'M5 4h14v16H5zM8 9l2 2 5-5M8 15h7',
  crew: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2',
  draft: 'm8 4 4 3 4-3 5 4-3 5-2-1v8H8v-8l-2 1-3-5 5-4Z',
  final: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 5 4m7-6h4v2a4 4 0 0 1-5 4m-3 1v7m-4 0h8',
  back: 'm10 5-7 7 7 7M3 12h18', close: 'm6 6 12 12M6 18 18 6', arrow: 'M4 12h16m-6-6 6 6-6 6',
};

export function LoungeIcon({ name }: { name: keyof typeof PATHS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}

export { BenchMark } from '../brand/Brand';

export function MemberFace({ row }: { row: Pick<StandingRow, 'name' | 'avatar'> }) {
  const [failed, setFailed] = useState<string>();
  const url = /^(https?:\/\/|\/)/.test(row.avatar);
  const initials = row.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className="lg-face" aria-hidden="true">{url && failed !== row.avatar ? <img src={row.avatar} alt="" onError={() => setFailed(row.avatar)} /> : url ? initials : row.avatar || initials}</span>;
}

export function Seats({ state, onMember, full = false }: { state: PartyStateResponse; onMember: (id: string) => void; full?: boolean }) {
  const rows = [...state.standings].sort((a, b) => a.rank - b.rank);
  return <section className={`lg-seats${full ? ' is-full' : ''}`} aria-labelledby="lg-seats-title">
    <header><h2 id="lg-seats-title">{full ? 'The crew' : 'Your seats'}</h2><span>{state.households.map((h) => h.city).join(' + ')}</span></header>
    {rows.length ? <div className="lg-seat-grid">{rows.map((row, index) => <button className="lg-seat lg-focus" type="button" key={row.memberId} id={`lg-seat-${row.memberId}`} data-lg-row={full ? String(1 + Math.floor(index / 2)) : '1'} onClick={() => onMember(row.memberId)} aria-label={`${row.name}, ${row.total.toFixed(1)} points, view roster`}>
      <span className="lg-seat-top"><MemberFace row={row} /><span className="lg-seat-name">{!full && row.name.length > 16 ? row.name.split(/\s+/)[0] : row.name}<small>{row.household}</small></span><span className="lg-seat-arrow"><LoungeIcon name="arrow" /></span></span>
      <span className="lg-seat-bottom"><span>{row.rank === 1 ? <><i className="lg-crown" aria-hidden="true">♔</i> Leading the room</> : `#${row.rank} in the room`}</span><b>{row.total.toFixed(1)}<small> pts</small></b></span>
      {full ? <span className="lg-seat-breakdown">Draft {row.draftPoints.toFixed(1)}<span>Picks {row.pickPoints.toFixed(1)}</span></span> : null}
    </button>)}</div> : <div className="lg-empty"><h3>A seat for everyone.</h3><p>Your friends will appear here when they join this party.</p></div>}
  </section>;
}

/** Original vector artwork. A football still life in the same palette as the basketball. */
export function FootballArt() {
  return <svg className="lg-ball-art" viewBox="0 0 560 510" aria-hidden="true">
    <defs>
      <radialGradient id="lg-fb-light" cx=".35" cy=".25" r=".85"><stop stopColor="#e0a070" /><stop offset=".6" stopColor="#a8583a" /><stop offset="1" stopColor="#6e3527" /></radialGradient>
      <pattern id="lg-fb-grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#3f2729" opacity=".25" /></pattern>
    </defs>
    <ellipse cx="306" cy="474" rx="191" ry="16" fill="#14141e" opacity=".45" />
    <g transform="rotate(-28 300 254)">
      <ellipse cx="300" cy="254" rx="250" ry="150" fill="url(#lg-fb-light)" />
      <ellipse cx="300" cy="254" rx="250" ry="150" fill="url(#lg-fb-grain)" />
      <path d="M95 175q30 79 0 158M505 175q-30 79 0 158" fill="none" stroke="#f3ecdf" strokeWidth="10" opacity=".85" />
      <path d="M215 254h170" stroke="#f3ecdf" strokeWidth="9" strokeLinecap="round" />
      <path d="M235 236v36M262 236v36M289 236v36M316 236v36M343 236v36M370 236v36" stroke="#f3ecdf" strokeWidth="7" strokeLinecap="round" />
    </g>
  </svg>;
}

/** Original vector artwork. A basketball still life, not a simulated game feed. */
export function BasketballArt() {
  return <svg className="lg-ball-art" viewBox="0 0 560 510" aria-hidden="true">
    <defs>
      <radialGradient id="lg-ball-light" cx=".3" cy=".2" r=".8"><stop stopColor="#f0b478" /><stop offset=".6" stopColor="#d77b44" /><stop offset="1" stopColor="#a84f32" /></radialGradient>
      <pattern id="lg-ball-grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#3f2729" opacity=".25" /></pattern>
      <clipPath id="lg-ball-clip"><circle cx="300" cy="254" r="207" /></clipPath>
    </defs>
    <ellipse cx="306" cy="474" rx="191" ry="16" fill="#14141e" opacity=".45" />
    <circle cx="300" cy="254" r="207" fill="url(#lg-ball-light)" />
    <g clipPath="url(#lg-ball-clip)" fill="none" stroke="#392729" strokeWidth="9">
      <path d="M115 110c136 25 279 135 367 286M92 313c163-73 317-89 423-17M258 35c-72 147-56 315 70 430M92 207c157 70 258-40 278-153M231 458c6-171 130-254 282-233" />
      <circle cx="300" cy="254" r="207" fill="url(#lg-ball-grain)" strokeWidth="3" />
    </g>
  </svg>;
}
