export function Ticker({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="tv-ticker" aria-label="Friends ticker">
      <span className="tv-ticker-label">The crew</span>
      <div className="tv-ticker-viewport">
        <div className="tv-ticker-track">
          {lines.slice(0, 2).map((l, i) => (
            <span className="tv-ticker-item" key={`a${i}`}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
