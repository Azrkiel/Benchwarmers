import { useState, type ReactNode } from 'react';
import type { Household } from '@shared/types';

export function householdColor(households: Household[], householdId?: string): string {
  return households.find((h) => h.id === householdId)?.color ?? '#8892a6';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function Avatar({ avatar, name, color, size = 64 }: { avatar?: string; name: string; color?: string; size?: number }) {
  const a = avatar ?? '';
  const [broken, setBroken] = useState(false);
  let inner: ReactNode;
  if ((a.startsWith('http') || a.startsWith('/')) && !broken) inner = <img src={a} alt={name} onError={() => setBroken(true)} />;
  else if (a && [...a].length <= 4) inner = <span className="tv-avatar-glyph">{a}</span>;
  else inner = <span className="tv-avatar-initials">{initials(name)}</span>;
  return (
    <span
      className="tv-avatar"
      style={{ width: size, height: size, fontSize: Math.max(24, size * 0.55), borderColor: color ?? '#8892a6' }}
      title={name}
    >
      {inner}
    </span>
  );
}
