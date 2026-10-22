import { useState } from 'react';
import type { Member } from '@shared/types';
import type { VoiceId } from './useVoiceId';
import { useUtteranceCapture } from './useUtteranceCapture';
import './voiceid.css';

export const ENROLL_SENTENCES = [
  'Tonight the stadium lights are on and the whole couch is cheering.',
  'Pass the nachos, the second half is about to kick off.',
  "What a play, I can't believe that last touchdown!",
] as const;

const CLIPS_NEEDED = ENROLL_SENTENCES.length;
const TOO_SHORT = 'Too short. Try again and speak for 2–3 seconds.';

/** Plain-language text for a mic/capture error message. */
export function describeMicError(message: string): string {
  if (/denied|notallowed|permission/i.test(message)) {
    return 'Microphone blocked. Allow it in your browser settings and try again.';
  }
  if (/notfound|no microphone|requested device/i.test(message)) {
    return 'No microphone found. Plug one in and try again.';
  }
  return `Could not use the microphone (${message}).`;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Per-member voice enrollment: three sentences, one clip each. Embeddable; no page chrome. */
export function EnrollPanel({ members, voice }: { members: Member[]; voice: VoiceId }) {
  const capture = useUtteranceCapture();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ memberId: string; text: string } | null>(null);
  const ready = voice.status === 'ready';

  const start = async (m: Member) => {
    setNotice(null);
    setRecordingId(m.id); // set first so a second click cannot start a second capture
    try {
      await capture.start();
    } catch (e) {
      setRecordingId(null);
      setNotice({ memberId: m.id, text: describeMicError(messageOf(e)) });
    }
  };

  const stop = async (m: Member) => {
    setRecordingId(null);
    let clip: Float32Array | null;
    try {
      clip = await capture.stop();
    } catch (e) {
      setNotice({ memberId: m.id, text: describeMicError(messageOf(e)) });
      return;
    }
    if (!clip) {
      setNotice({ memberId: m.id, text: TOO_SHORT });
      return;
    }
    try {
      await voice.enroll(m, clip);
    } catch (e) {
      const msg = messageOf(e);
      setNotice({ memberId: m.id, text: msg === 'clip too short' ? TOO_SHORT : `Could not save that clip: ${msg}` });
    }
  };

  const clearMember = (m: Member) => {
    setNotice(null);
    voice.clear(m.id);
  };

  const reEnroll = (m: Member) => {
    clearMember(m);
    if (ready) void start(m);
  };

  return (
    <section className="vid-root vid-panel" aria-label="Voice enrollment">
      {!ready && (
        <p className="vid-hint">
          {voice.status === 'error'
            ? `Speaker model failed to load${voice.error ? `: ${voice.error}` : '.'}`
            : 'Recording unlocks when the speaker model is ready.'}
        </p>
      )}
      <div className="vid-grid">
        {members.map((m) => {
          const profile = voice.profiles.find((p) => p.memberId === m.id);
          const clips = Math.min(profile?.samples.length ?? 0, CLIPS_NEEDED);
          const enrolled = clips >= CLIPS_NEEDED;
          const isRec = recordingId === m.id;
          const otherRecording = recordingId !== null && !isRec;
          const level = Math.round(clamp01(capture.level) * 100);
          return (
            <article className="vid-card" key={m.id}>
              <header className="vid-card-head">
                <span className="vid-avatar" aria-hidden="true">{m.avatar}</span>
                <h3>{m.name}</h3>
                <span className={enrolled ? 'vid-status vid-status-done' : 'vid-status'}>
                  {enrolled ? 'Enrolled' : `${clips}/${CLIPS_NEEDED} clips`}
                </span>
              </header>

              <ol className="vid-sentences">
                {ENROLL_SENTENCES.map((s, i) => (
                  <li key={s} className={i < clips ? 'vid-done' : i === clips ? 'vid-next' : undefined}>
                    {s}
                  </li>
                ))}
              </ol>

              {!enrolled &&
                (isRec ? (
                  <div className="vid-recording">
                    <div
                      className="vid-meter"
                      role="meter"
                      aria-label="Microphone level"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={level}
                    >
                      <span style={{ width: `${level}%` }} />
                    </div>
                    <p className="vid-listening">Listening…</p>
                    <button type="button" className="vid-btn vid-btn-stop" onClick={() => void stop(m)}>
                      Stop
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="vid-btn vid-btn-primary"
                    disabled={!ready || otherRecording}
                    onClick={() => void start(m)}
                  >
                    Record sentence {clips + 1}
                  </button>
                ))}

              <div className="vid-actions">
                <button
                  type="button"
                  className="vid-btn"
                  disabled={isRec}
                  onClick={() => reEnroll(m)}
                >
                  Re-enroll
                </button>
                <button
                  type="button"
                  className="vid-btn"
                  disabled={!profile || isRec}
                  onClick={() => clearMember(m)}
                >
                  Clear
                </button>
              </div>

              {notice?.memberId === m.id && (
                <p className="vid-notice" role="alert">
                  {notice.text}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
