import { useEffect, useRef, useState, type FormEvent } from 'react';
import { describeSpeechError, getRecognizerFactory, type RecognizerLike } from '../device/speech';

export function RoomAssistant({ busy, onCommand }: { busy: boolean; onCommand: (text: string) => Promise<string | undefined> }) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const recognizer = useRef<RecognizerLike | null>(null);
  const mounted = useRef(true);
  const command = useRef(onCommand); command.current = onCommand;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recognizer.current?.abort(); }; }, []);
  async function send(value: string) {
    if (!value.trim() || busy) return;
    const response = await command.current(value.trim());
    if (mounted.current && response) { setReply(response); setText(''); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(text); }
  function listen() {
    if (listening) { recognizer.current?.stop(); return; }
    const factory = getRecognizerFactory(window); if (!factory) return;
    const recognition = factory(); recognizer.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex]; if (!result?.isFinal || !mounted.current) return;
      const value = result[0]?.transcript ?? ''; setText(value); void send(value);
    };
    recognition.onerror = (event) => { if (mounted.current) { setSpeechError(describeSpeechError(event.error)); setListening(false); } };
    recognition.onend = () => { if (mounted.current) setListening(false); };
    try { setSpeechError(''); setListening(true); recognition.start(); }
    catch { setSpeechError('Microphone could not start. Type your command instead.'); setListening(false); }
  }
  const canSpeak = !!getRecognizerFactory(window) && window.isSecureContext !== false;
  return <section className="rm-assistant"><span className="rm-eyebrow">Assistant</span><form onSubmit={submit}><label htmlFor="rm-command">Ask the room assistant</label><div className="rm-input-row"><input id="rm-command" value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder="“Pick touchdown” or “auto lineup”" /><button className="rm-primary" disabled={busy || !text.trim()}>Send command</button><button type="button" disabled={!canSpeak || busy} aria-pressed={listening} aria-label={listening ? 'Stop microphone' : 'Speak command'} onClick={listen}>{listening ? 'Stop' : 'Mic'}</button></div></form>{!canSpeak && <p className="rm-muted">Voice isn’t available in this browser. Typing works.</p>}{listening && <p role="status">Listening…</p>}{speechError && <p className="rm-error" role="alert">{speechError}</p>}<p className="rm-assistant-reply" role="status">{reply}</p></section>;
}
