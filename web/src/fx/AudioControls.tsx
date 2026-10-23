import { useEffect, useState } from 'react';
import type { AudioState, SharedAudio } from './audio';

export function useAudioState(audio: SharedAudio): AudioState {
  const [state, setState] = useState(audio.snapshot);
  useEffect(() => audio.subscribe(setState), [audio]);
  return state;
}

/** Explicit opt-in for this screen's sound, plus mute and volume. Captions never depend on it. */
export function AudioControls({ audio }: { audio: SharedAudio }) {
  const state = useAudioState(audio);
  if (!state.enabled || !state.leader) {
    return <span className="ac">
      <button type="button" onClick={() => { void audio.enable(); }}>{state.enabled ? 'Play sound here' : 'Enable sound'}</button>
      {state.error && <small role="status">{state.error}</small>}
    </span>;
  }
  return <span className="ac">
    <button type="button" aria-pressed={state.muted} onClick={() => audio.setMuted(!state.muted)}>{state.muted ? 'Unmute' : 'Mute'}</button>
    <label className="ac-volume">Volume<input type="range" min={0} max={100} step={10} value={Math.round(state.volume * 100)} onChange={(event) => audio.setVolume(Number(event.target.value) / 100)} /></label>
    {state.error && <small role="status">{state.error}</small>}
  </span>;
}
