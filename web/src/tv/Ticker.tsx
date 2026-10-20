export function Ticker({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="tv-ticker" aria-label="Friends ticker">
      <span className="tv-ticker-label">Friends</span>
      <div className="tv-ticker-viewport">
        <div className="tv-ticker-track">
          {lines.map((l, i) => (
            <span className="tv-ticker-item" key={`a${i}`}>{l}</span>
          ))}
          {lines.map((l, i) => (
            <span className="tv-ticker-item" key={`b${i}`} aria-hidden="true">{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
