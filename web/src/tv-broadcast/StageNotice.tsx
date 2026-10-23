export const MIN_W = 900;
export const MIN_H = 500;

export function tooSmall(winW: number, winH: number): boolean {
  return winW < MIN_W || winH < MIN_H;
}

export function StageNotice() {
  const last = location.pathname.split('/').pop() || 'latest';
  return (
    <div className="tv-small-screen" role="status">
      <h1>TV view needs a larger screen</h1>
      <p>Use the phone view here, or open this link on a TV or desktop display.</p>
      <a className="tv-action tv-action-primary" href={`/control/${encodeURIComponent(last)}${location.search}`}>Open phone view</a>
      <a className="tv-home" href="/">Home</a>
    </div>
  );
}
