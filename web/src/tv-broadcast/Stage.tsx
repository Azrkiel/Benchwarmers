import { useEffect, useState, type ReactNode } from 'react';
import { StageNotice, tooSmall } from './StageNotice';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function fitScale(winW: number, winH: number, w = STAGE_W, h = STAGE_H) {
  const scale = Math.min(winW / w, winH / h);
  return { scale, offsetX: (winW - w * scale) / 2, offsetY: (winH - h * scale) / 2 };
}

function current() {
  return fitScale(window.innerWidth || STAGE_W, window.innerHeight || STAGE_H);
}

function isSmall() {
  return tooSmall(window.innerWidth || STAGE_W, window.innerHeight || STAGE_H);
}

export function Stage({ children, overlay = false }: { children: ReactNode; overlay?: boolean }) {
  const [fit, setFit] = useState(current);
  const [small, setSmall] = useState(isSmall);
  useEffect(() => {
    const onResize = () => { setFit(current()); setSmall(isSmall()); };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div className={`tv-viewport tv-broadcast${overlay ? ' is-overlay' : ''}${small ? ' is-too-small' : ''}`}>
      {small ? <StageNotice /> : null}
      <div
        className="tv-stage"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
