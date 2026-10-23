import { useEffect, useRef, useState } from 'react';
import type { SharedAudio } from './audio';
import { useAudioState } from './AudioControls';

export type LeaseState = { mode: 'room' | 'local' | 'idle'; heldBy?: string };
const RENEW_MS = 10_000;

function deviceId(): string {
  const key = 'bw.playback.device';
  try {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const fresh = `screen-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(key, fresh);
    return fresh;
  } catch { return `screen-${Math.random().toString(36).slice(2, 14)}`; }
}

/**
 * Cross-device playback leader for one room. While this screen has sound enabled it
 * claims and renews the room lease; if another screen holds it, sound stays off here
 * until someone takes over explicitly. Without the server route (older servers), the
 * screen falls back to this-browser-only coordination and says so.
 */
export function usePlaybackLease(code: string, audio: SharedAudio, { hostToken, label = 'Shared screen' }: { hostToken?: string; label?: string } = {}) {
  const state = useAudioState(audio);
  const [lease, setLease] = useState<LeaseState>({ mode: 'idle' });
  const id = useRef(deviceId());
  const force = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const wantsSound = state.enabled;
  useEffect(() => {
    if (!wantsSound || !code) { setLease({ mode: 'idle' }); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function claim() {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(code)}/playback/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: id.current, label, force: force.current, ...(force.current && hostToken ? { hostToken } : {}) }) });
        force.current = false;
        if (!active) return;
        if (response.status === 404) { setLease({ mode: 'local' }); return; }
        const body = await response.json() as { granted?: boolean; lease?: { label: string } | null };
        if (body.granted) { if (!audio.snapshot.leader) void audio.enable(); setLease({ mode: 'room' }); timer = setTimeout(claim, RENEW_MS); }
        else { audio.yieldLeader(); setLease({ mode: 'room', heldBy: body.lease?.label ?? 'another screen' }); timer = setTimeout(claim, RENEW_MS); }
      } catch { if (active) { setLease((current) => current.mode === 'idle' ? { mode: 'local' } : current); timer = setTimeout(claim, RENEW_MS); } }
    }
    void claim();
    return () => {
      active = false; clearTimeout(timer);
      void fetch(`/api/rooms/${encodeURIComponent(code)}/playback/release`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: id.current }), keepalive: true }).catch(() => undefined);
    };
  }, [code, wantsSound, hostToken, label, attempt, audio]);
  /** Explicit takeover (a host credential lets it replace another screen's lease). */
  const takeOver = () => { force.current = true; void audio.enable(); setAttempt((n) => n + 1); };
  return { lease, takeOver };
}
