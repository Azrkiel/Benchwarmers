import { useEffect, type CSSProperties } from 'react';
import type { SharedAudio } from './audio';
import type { Celebration } from './celebrations';
import './basketball.css';

const PIECES = Array.from({ length: 28 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 70, drift: ((i * 53) % 60) - 30, hue: i % 3 }));

/**
 * Full-screen scoring moment: dim, original SVG ball arcs into the hoop, swish, then
 * confetti and the scorer label, all inside ~2.2 s. Decorative and pointer-transparent;
 * the score itself is already updated underneath. Reduced motion shows a static banner.
 */
export function BasketballCelebration({ celebration, reducedMotion = false, coalesced = 0, status, audio }: { celebration: Celebration | null; reducedMotion?: boolean; coalesced?: number; status?: string; audio?: SharedAudio }) {
  const id = celebration?.id;
  useEffect(() => {
    if (!id || !audio || reducedMotion) return;
    // Swish as the ball drops through (~1.1 s), then a short cheer.
    const swish = setTimeout(() => audio.play('swish'), 1100);
    const cheer = setTimeout(() => audio.play('cheer'), 1300);
    return () => { clearTimeout(swish); clearTimeout(cheer); };
  }, [id, audio, reducedMotion]);
  if (!celebration) return null;
  const style = { '--team': celebration.color } as CSSProperties;
  const caption = `${celebration.title}${celebration.sub ? `, ${celebration.sub}` : ''}`;
  if (reducedMotion) {
    return <div className="bc bc-static" style={style} key={celebration.id}>
      <div className="bc-banner"><b>{celebration.title}</b>{celebration.sub && <span>{celebration.sub}</span>}{celebration.points ? <strong>+{celebration.points}</strong> : null}</div>
      <span className="bc-sr" role="status">{caption}</span>
    </div>;
  }
  const hoop = celebration.kind === 'basket';
  return <div className={`bc is-${celebration.kind}`} style={style} key={celebration.id}>
    <div className="bc-dim" aria-hidden="true" />
    {status && <p className="bc-status" aria-hidden="true">{status}</p>}
    {hoop && <svg className="bc-hoop" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
      <rect className="bc-board" x="130" y="30" width="140" height="90" rx="4" />
      <rect className="bc-board-box" x="175" y="62" width="50" height="38" />
      <g className="bc-ball"><circle r="22" /><path d="M-22 0H22M0 -22V22M-15 -16Q0 0 -15 16M15 -16Q0 0 15 16" /></g>
      <g className="bc-net"><path d="M168 122L180 176L192 124L200 178L208 124L220 176L232 122M174 146H226M180 168H220" /></g>
      <path className="bc-rim" d="M164 120H236" />
    </svg>}
    <div className="bc-confetti" aria-hidden="true">{PIECES.map((piece, i) => <i key={i} className={`h${piece.hue}`} style={{ left: `${piece.left}%`, animationDelay: `${1100 + piece.delay}ms`, '--drift': `${piece.drift}px` } as CSSProperties} />)}</div>
    <div className="bc-label" aria-hidden="true"><b>{celebration.title}</b>{celebration.sub && <span>{celebration.sub}</span>}{coalesced > 0 && <small>+{coalesced} more {coalesced === 1 ? 'score' : 'scores'}</small>}</div>
    <span className="bc-sr" role="status">{caption}</span>
  </div>;
}
