import { useEffect, useState, type ReactNode } from 'react';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function fitScale(winW: number, winH: number, w = STAGE_W, h = STAGE_H) {
  const scale = Math.min(winW / w, winH / h);
  return { scale, offsetX: (winW - w * scale) / 2, offsetY: (winH - h * scale) / 2 };
}

function current() {
  return fitScale(window.innerWidth || STAGE_W, window.innerHeight || STAGE_H);
}

export function Stage({ children }: { children: ReactNode }) {
  const [fit, setFit] = useState(current);
  useEffect(() => {
    const onResize = () => setFit(current());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div className="tv-viewport tv-original">
      <div className="tv-small-screen"><h1>Open your companion view</h1><p>This shared display needs a wider screen.</p><a className="tv-action tv-action-primary" href={`/control/${encodeURIComponent(location.pathname.split('/').pop() || 'latest')}${location.search}`}>Open companion view</a><a className="tv-home" href="/">Home</a></div>
      <div
        className="tv-stage"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
