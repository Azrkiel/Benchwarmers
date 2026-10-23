import { useEffect, useState } from 'react';
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
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? '');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!recordingId) return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recordingId]);
  const selected = members.find(member => member.id === selectedId) ?? members[0];

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
    setSaving(true);
    try {
      await voice.enroll(m, clip);
    } catch (e) {
      const msg = messageOf(e);
      setNotice({ memberId: m.id, text: msg === 'clip too short' ? TOO_SHORT : `Could not save that clip: ${msg}` });
    } finally { setSaving(false); }
  };

  const clearMember = (m: Member) => {
    setNotice(null);
    voice.clear(m.id);
  };

  if (!selected) return <p>No players available for voice setup.</p>;
  const m = selected;
  const profile = voice.profiles.find(profile => profile.memberId === m.id);
  const clips = Math.min(profile?.samples.length ?? 0, CLIPS_NEEDED);
  const enrolled = clips >= CLIPS_NEEDED;
  const isRec = recordingId === m.id;
  const level = Math.round(clamp01(capture.level) * 100);
  return <section className="vid-root vid-panel" aria-label="Voice enrollment">
    <h2>Record voice samples</h2>
    <div className="vid-segment" role="group" aria-label="Player">
      {members.map(member => <button type="button" className="vid-btn vid-seg" key={member.id} disabled={!!recordingId || saving} aria-pressed={member.id === m.id} onClick={() => {setSelectedId(member.id);setConfirm(false);setNotice(null);}}>{member.name}</button>)}
    </div>
    {!ready ? <p className="vid-hint">Prepare voice recognition to record samples.</p> : null}
    <article className="vid-card">
      <header className="vid-card-head"><h3>{m.name}</h3><span className={enrolled ? 'vid-status vid-status-done' : 'vid-status'}>{enrolled ? '✓ Ready' : `${clips}/3 samples saved`}</span></header>
      <p className="vid-note">{clips > 0 ? `✓ ${clips} of 3 samples complete` : 'Read each sentence aloud for 2–3 seconds.'}</p>
      {!enrolled ? <p className="vid-sample">{ENROLL_SENTENCES[clips]}</p> : <p>Voice samples ready. Test recognition below or return to the game.</p>}
      {!enrolled && (isRec ? <div className="vid-recording">
        <div className="vid-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}><span style={{width:`${level}%`}} /></div>
        <p className="vid-listening">Recording · {seconds}s</p>
        <button type="button" className="vid-btn vid-btn-stop" onClick={() => void stop(m)}>Stop recording</button>
      </div> : <button type="button" className="vid-btn vid-btn-primary" disabled={!ready || saving || !!recordingId} onClick={() => void start(m)}>{saving ? 'Saving sample…' : `Record sample ${clips + 1} of 3`}</button>)}
      {profile ? <div className="vid-actions"><button className="vid-btn" type="button" disabled={!!recordingId || saving} onClick={() => setConfirm(true)}>Record again</button><button className="vid-btn" type="button" disabled={!!recordingId || saving} onClick={() => setConfirm(true)}>Delete voice samples</button></div> : null}
      {confirm ? <div className="vid-confirm" role="group" aria-label="Confirm voice sample deletion"><p>Delete all saved voice samples for {m.name}? Recognition for this player stops until three new samples are saved.</p><button className="vid-btn" type="button" onClick={() => {clearMember(m);setConfirm(false);}}>Delete and start over</button><button className="vid-btn" type="button" onClick={() => setConfirm(false)}>Cancel</button></div> : null}
      {notice?.memberId === m.id ? <p className="vid-notice" role="alert">{notice.text}</p> : null}
    </article>
  </section>;
}
