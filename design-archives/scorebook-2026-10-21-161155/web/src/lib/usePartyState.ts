import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartyStateResponse } from '@shared/types';
import { api } from './api';
import { FIXTURES, FIXTURE_ORDER, isFixtureName, type FixtureName } from './fixtures';

export type FixtureMode = FixtureName | 'cycle';

export function parseFixtureMode(v: string | null | undefined): FixtureMode | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'cycle') return 'cycle';
  return isFixtureName(s) ? s : undefined;
}

export function computeServerOffset(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

/** Server-time ms at which the active prop locks, if known. */
export function lockDeadline(state: PartyStateResponse): number | undefined {
  const p = state.activeProp;
  if (!p || p.status !== 'open' || typeof p.realSecondsToLock !== 'number') return undefined;
  return state.serverNow + p.realSecondsToLock * 1000;
}

export function secondsLeft(deadlineServerMs: number | undefined, serverNowMs: number): number {
  if (deadlineServerMs === undefined) return 0;
  return Math.max(0, Math.ceil((deadlineServerMs - serverNowMs) / 1000));
}

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export type PartyStateOptions = { fixture?: FixtureMode; intervalMs?: number; crew?: string; cycleMs?: number };
export type PartyStateResult = {
  state?: PartyStateResponse;
  error?: string;
  code: string;
  serverNow: () => number;
  fixture?: FixtureMode;
};

const DEFAULT_CREW = 'sunday-crew';
const RERESOLVE_EVERY = 5;

function fixtureAt(mode: FixtureMode, idx: number): PartyStateResponse {
  return mode === 'cycle' ? FIXTURES[FIXTURE_ORDER[idx % FIXTURE_ORDER.length]] : FIXTURES[mode];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function usePartyState(code: string, opts: PartyStateOptions = {}): PartyStateResult {
  const { fixture, intervalMs = 1000, crew, cycleMs = 20000 } = opts;
  const isLatest = code.toLowerCase() === 'latest';
  const crewName = crew || DEFAULT_CREW;

  const offsetRef = useRef<number>(0);
  const [state, setState] = useState<PartyStateResponse | undefined>(() => {
    if (!fixture) return undefined;
    const f = fixtureAt(fixture, 0);
    offsetRef.current = computeServerOffset(f.serverNow, Date.now());
    return f;
  });
  const [error, setError] = useState<string | undefined>(undefined);
  const [resolved, setResolved] = useState<string | undefined>(undefined);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // Fixture mode.
  useEffect(() => {
    if (!fixture) return;
    let idx = 0;
    const apply = () => {
      const f = fixtureAt(fixture, idx);
      offsetRef.current = computeServerOffset(f.serverNow, Date.now());
      setState(f);
      setError(undefined);
    };
    apply();
    if (fixture !== 'cycle') return;
    const id = setInterval(() => {
      idx += 1;
      apply();
    }, cycleMs);
    return () => clearInterval(id);
  }, [fixture, cycleMs]);

  // Network mode.
  useEffect(() => {
    if (fixture) return;
    let cancelled = false;
    let inFlight = false;
    let tickNo = 0;
    let current: string | undefined = isLatest ? undefined : code;
    let needResolve = isLatest;
    setState(undefined);
    setError(undefined);
    setResolved(undefined);

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const n = tickNo++;
        if (isLatest && (needResolve || n % RERESOLVE_EVERY === 0)) {
          try {
            const r = await fetch(`/api/crews/${encodeURIComponent(crewName)}/current`);
            if (!r.ok) throw new Error(r.statusText || `HTTP ${r.status}`);
            const body = (await r.json()) as { code?: string };
            if (!body.code) throw new Error('no current party');
            if (cancelled) return;
            needResolve = false;
            if (body.code !== current) {
              current = body.code;
              setResolved(body.code);
            }
          } catch (e) {
            if (cancelled) return;
            needResolve = true;
            setError(errMsg(e));
            return;
          }
        }
        if (!current) return;
        const target = current;
        try {
          const res = await api.state(target);
          if (cancelled || target !== current) return;
          offsetRef.current = computeServerOffset(res.serverNow, Date.now());
          setState(res);
          setError(undefined);
        } catch (e) {
          if (cancelled) return;
          setError(errMsg(e));
        }
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fixture, code, isLatest, crewName, intervalMs]);

  return {
    state,
    error,
    code: fixture ? code : isLatest ? (resolved ?? code) : code,
    serverNow,
    fixture,
  };
}
