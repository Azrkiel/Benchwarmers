/**
 * Shared-display sound: a swish and a short cheer, synthesized with Web Audio so no
 * recorded or licensed assets are involved (see web/public/audio/ATTRIBUTION.md).
 *
 * Sound stays off until someone explicitly enables it on this screen. Only one tab in
 * this browser plays at a time (BroadcastChannel); the cross-device playback lease is
 * a separate server concern. Speech always wins: while the mic or assistant is active,
 * nothing plays and anything playing stops.
 */
export type CheerSound = 'swish' | 'cheer';
export type AudioState = { enabled: boolean; muted: boolean; volume: number; leader: boolean; speaking: boolean; error: string };
type Listener = (state: AudioState) => void;
type AudioContextLike = Pick<AudioContext, 'currentTime' | 'destination' | 'createGain' | 'createBufferSource' | 'createBuffer' | 'createBiquadFilter' | 'resume' | 'sampleRate' | 'state'>;

const CHANNEL = 'bw-shared-audio';

export class SharedAudio {
  private state: AudioState = { enabled: false, muted: false, volume: 0.6, leader: false, speaking: false, error: '' };
  private listeners = new Set<Listener>();
  private context: AudioContextLike | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private channel: BroadcastChannel | null = null;
  private readonly id = Math.random().toString(36).slice(2);
  private claimedAt = 0;

  constructor(private createContext: () => AudioContextLike | null = defaultContext) {
    try {
      this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
      // Only a newer claim takes over, so a late-delivered older claim cannot steal playback back.
      this.channel?.addEventListener('message', (event: MessageEvent<{ claim?: string; at?: number }>) => {
        const { claim, at = 0 } = event.data ?? {};
        if (!claim || claim === this.id || !this.state.leader) return;
        if (at > this.claimedAt || (at === this.claimedAt && claim > this.id)) { this.stop(); this.set({ leader: false }); }
      });
    } catch { this.channel = null; }
  }

  get snapshot(): AudioState { return this.state; }
  subscribe(listener: Listener) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }

  /** Must run from a user gesture (browsers block audio otherwise). Takes playback over from other tabs. */
  async enable(): Promise<boolean> {
    try {
      this.context ??= this.createContext();
      if (!this.context) { this.set({ error: 'Sound is not supported in this browser.' }); return false; }
      if (this.context.state === 'suspended') await this.context.resume();
      this.claimedAt = Date.now();
      this.channel?.postMessage({ claim: this.id, at: this.claimedAt });
      this.set({ enabled: true, leader: true, error: '' });
      return true;
    } catch { this.set({ error: 'Sound could not start. Captions stay on.' }); return false; }
  }
  disable() { this.stop(); this.set({ enabled: false, leader: false }); }
  /** Another screen holds the room's playback lease: stay enabled but silent. */
  yieldLeader() { this.stop(); if (this.state.leader) this.set({ leader: false }); }
  setMuted(muted: boolean) { if (muted) this.stop(); this.set({ muted }); }
  setVolume(volume: number) { this.set({ volume: Math.max(0, Math.min(1, volume)) }); }
  /** Microphone or assistant speech in progress: stop and hold all sound. */
  setSpeaking(speaking: boolean) { if (speaking) this.stop(); this.set({ speaking }); }

  canPlay(): boolean { const s = this.state; return s.enabled && s.leader && !s.muted && !s.speaking && s.volume > 0 && !!this.context; }

  play(sound: CheerSound): boolean {
    if (!this.canPlay()) return false;
    try {
      const ctx = this.context!;
      const seconds = sound === 'swish' ? 0.35 : 1.2;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const noise = Math.random() * 2 - 1;
        // Swish: a fast-decaying airy burst. Cheer: a crowd-like swell with a gentle flutter.
        const envelope = sound === 'swish' ? Math.exp(-t * 14) * Math.min(1, t * 80) : Math.sin(Math.PI * Math.min(1, t / seconds)) * (0.75 + 0.25 * Math.sin(t * 38));
        data[i] = noise * envelope;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = sound === 'swish' ? 'highpass' : 'bandpass';
      filter.frequency.value = sound === 'swish' ? 2400 : 1100;
      const gain = ctx.createGain();
      gain.gain.value = this.state.volume * (sound === 'swish' ? 0.5 : 0.35);
      source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      source.onended = () => this.playing.delete(source);
      this.playing.add(source);
      source.start();
      return true;
    } catch { this.set({ error: 'Sound could not play. Captions stay on.' }); return false; }
  }

  dispose() { this.stop(); this.channel?.close(); this.channel = null; this.listeners.clear(); }

  stop() { for (const source of this.playing) { try { source.stop(); } catch { /* already stopped */ } } this.playing.clear(); }

  private set(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}

function defaultContext(): AudioContextLike | null {
  const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Ctor ? new Ctor() : null;
}

let shared: SharedAudio | null = null;
export function sharedAudio(): SharedAudio { return (shared ??= new SharedAudio()); }
