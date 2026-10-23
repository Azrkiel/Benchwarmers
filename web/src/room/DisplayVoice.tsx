import { useEffect, useRef, useState } from 'react';
import { describeSpeechError, getRecognizerFactory, type RecognizerLike } from '../device/speech';
import type { SharedAudio } from '../fx/audio';
import { voiceInputProblem, type AssistantReply } from './RoomAssistant';

/**
 * Microphone for the shared screen. It has no participant seat, so it answers public
 * questions and host commands (when this screen holds the host credential); personal
 * picks are refused by the server with "Choose who you are first".
 */
export function DisplayVoice({ onCommand, onReply, audio, speak, cancelSpeech }: { onCommand: (text: string) => Promise<AssistantReply | undefined>; onReply: (text: string) => void; audio: SharedAudio; speak: (text: string) => void; cancelSpeech: () => void }) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');
  const recognizer = useRef<RecognizerLike | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recognizer.current?.abort(); }; }, []);
  useEffect(() => { audio.setSpeaking(listening); }, [audio, listening]);
  const problem = voiceInputProblem();
  function listen() {
    if (listening) { recognizer.current?.stop(); return; }
    const factory = getRecognizerFactory(window); if (!factory || problem) return;
    cancelSpeech();
    const recognition = factory(); recognizer.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = async (event) => {
      const result = event.results[event.resultIndex]; if (!result?.isFinal) return;
      const text = result[0]?.transcript ?? '';
      setStatus(`“${text}”`);
      try {
        const reply = await onCommand(text);
        if (!mounted.current) return;
        const said = reply?.reply ?? 'Could not confirm that request.';
        onReply(said); speak(said); setStatus('');
      } catch { if (mounted.current) setStatus('Could not confirm that request.'); }
    };
    recognition.onerror = (event) => { if (mounted.current) { setStatus(describeSpeechError(event.error)); setListening(false); } };
    recognition.onend = () => { if (mounted.current) setListening(false); };
    try { setStatus(''); setListening(true); recognition.start(); }
    catch { setStatus('Microphone could not start.'); setListening(false); }
  }
  return <span className="rd-voice">
    <button type="button" onClick={listen} disabled={!!problem} aria-pressed={listening} title={problem || undefined} aria-label={listening ? 'Stop listening' : 'Ask by voice'}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></svg>
      {listening ? 'Listening…' : 'Ask'}
    </button>
    {status && <small role="status">{status}</small>}
  </span>;
}
