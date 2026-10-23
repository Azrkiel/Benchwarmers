export function Ticker({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return <div className="tv-ticker" aria-label="Latest party update"><span className="tv-ticker-label">Latest</span><span className="tv-ticker-item">{lines[0]}</span></div>;
}
