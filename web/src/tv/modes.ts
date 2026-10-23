import { useEffect, useRef, useState } from 'react';
import type { PartyStateResponse, PartyStatus } from '@shared/types';

export type TvMode = 'draft' | 'live' | 'rosters' | 'final';

export const ROTATE_MS = 20000;

export function baseModeFor(status: PartyStatus): TvMode {
  if (status === 'final') return 'final';
  if (status === 'live') return 'live';
  return 'draft';
}

export function activitySignature(state: PartyStateResponse): string {
  return `${state.party.status}|${state.recentEvents[0]?.id ?? ''}|${state.activeProp?.id ?? ''}`;
}

export type ModeState = { mode: TvMode; sig: string; changedAt: number };

export function nextMode(
  prev: ModeState,
  input: { status: PartyStatus; sig: string; now: number },
  rotateMs = ROTATE_MS,
): ModeState {
  if (input.status !== 'live') {
    const mode = baseModeFor(input.status);
    if (mode === prev.mode && input.sig === prev.sig) return prev;
    return { mode, sig: input.sig, changedAt: input.now };
  }
  if (input.sig !== prev.sig) return { mode: 'live', sig: input.sig, changedAt: input.now };
  if (prev.mode !== 'live' && prev.mode !== 'rosters') return { mode: 'live', sig: prev.sig, changedAt: input.now };
  if (input.now - prev.changedAt >= rotateMs) {
    return { mode: prev.mode === 'live' ? 'rosters' : 'live', sig: prev.sig, changedAt: input.now };
  }
  return prev;
}

export function useTvMode(state: PartyStateResponse | undefined, rotateMs = Number.POSITIVE_INFINITY): TvMode {
  const [ms, setMs] = useState<ModeState>(() => ({
    mode: state ? baseModeFor(state.party.status) : 'draft',
    sig: state ? activitySignature(state) : '',
    changedAt: Date.now(),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const run = () => {
      const s = stateRef.current;
      if (!s) return;
      setMs((prev) => nextMode(prev, { status: s.party.status, sig: activitySignature(s), now: Date.now() }, rotateMs));
    };
    run();
    const id = setInterval(run, 1000);
    return () => clearInterval(id);
  }, [state, rotateMs]);

  return ms.mode;
}
