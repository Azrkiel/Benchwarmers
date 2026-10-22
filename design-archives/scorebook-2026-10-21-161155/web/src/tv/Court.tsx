/** Simulated full court. viewBox 940x500 (ft * 10). Home attacks the right basket. */
const LEFT_BASKET = { x: 52.5, y: 250 };
const RIGHT_BASKET = { x: 887.5, y: 250 };

export function Court({
  homeColor,
  awayColor,
  scoring,
  pulseKey,
}: {
  homeColor: string;
  awayColor: string;
  scoring?: 'home' | 'away';
  pulseKey?: string;
}) {
  const basket = scoring === 'home' ? RIGHT_BASKET : scoring === 'away' ? LEFT_BASKET : undefined;
  return (
    <svg className="tv-court" viewBox="0 0 940 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="0" y="0" width="470" height="500" fill={awayColor} className={`tv-court-half${scoring === 'away' ? ' is-hot' : ''}`} />
      <rect x="470" y="0" width="470" height="500" fill={homeColor} className={`tv-court-half${scoring === 'home' ? ' is-hot' : ''}`} />
      <g className="tv-court-lines" fill="none">
        <rect x="0" y="0" width="940" height="500" />
        <line x1="470" y1="0" x2="470" y2="500" />
        <circle cx="470" cy="250" r="60" />
        <rect x="0" y="170" width="190" height="160" />
        <rect x="750" y="170" width="190" height="160" />
        <circle cx="190" cy="250" r="60" />
        <circle cx="750" cy="250" r="60" />
        <path d="M0 30 L142 30 A237.5 237.5 0 0 1 142 470 L0 470" />
        <path d="M940 30 L798 30 A237.5 237.5 0 0 0 798 470 L940 470" />
        <line x1="40" y1="230" x2="40" y2="270" />
        <line x1="900" y1="230" x2="900" y2="270" />
        <circle cx={LEFT_BASKET.x} cy={LEFT_BASKET.y} r="7.5" />
        <circle cx={RIGHT_BASKET.x} cy={RIGHT_BASKET.y} r="7.5" />
      </g>
      {basket && pulseKey ? (
        <g key={pulseKey} className="tv-court-marker" data-testid="court-marker">
          <circle className="tv-court-ping" cx={basket.x} cy={basket.y} r="22" />
          <circle className="tv-court-ball" cx={basket.x} cy={basket.y + 34} r="10" />
        </g>
      ) : null}
    </svg>
  );
}
