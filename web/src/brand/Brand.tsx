import type { CSSProperties } from 'react';

/** Original Benchwarmers bench mark. */
export function BenchMark() {
  return <svg viewBox="0 0 48 42" fill="none" aria-hidden="true"><path d="M7 13h34v9H7zM11 7h26v6H11z" fill="currentColor" /><path d="m13 22-4 13m26-13 4 13M17 22v12m14-12v12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>;
}

/** Shared bench mark and wordmark. `size` is the wordmark font size in CSS px. */
export function BrandLockup({ size = 32, stacked = false, className = '' }: { size?: number; stacked?: boolean; className?: string }) {
  const style: CSSProperties = { fontSize: size };
  return (
    <span className={`bw-brand${stacked ? ' is-stacked' : ''} ${className}`.trim()} style={style} role="img" aria-label="Benchwarmers">
      <BenchMark />
      <span className="bw-brand-word" aria-hidden="true">Benchwarmers</span>
    </span>
  );
}
