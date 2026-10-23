import { useEffect, useRef, useState, type FormEvent } from 'react';
import { describeSpeechError, getRecognizerFactory, type RecognizerLike } from '../device/speech';

export function RoomAssistant({ busy, onCommand }: { busy: boolean; onCommand: (text: string) => Promise<string | undefined> }) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [sending, setSending] = useState(false);
  const [request, setRequest] = useState('');
  const recognizer = useRef<RecognizerLike | null>(null);
  const mounted = useRef(true);
  const command = useRef(onCommand); command.current = onCommand;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recognizer.current?.abort(); }; }, []);
  async function send(value: string) {
    if (!value.trim() || busy || sending) return;
    setSending(true); setRequest(value.trim()); setReply('');
    try {
      const response = await command.current(value.trim());
      if (mounted.current) { setReply(response ?? 'Could not send. Try again.'); if (response) setText(''); }
    } catch { if (mounted.current) setReply('Could not send. Try again.'); }
    finally { if (mounted.current) setSending(false); }
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
    catch { setSpeechError('Microphone could not start. Try again or type below.'); setListening(false); }
  }
  const canSpeak = !!getRecognizerFactory(window) && window.isSecureContext !== false;
  return <section className="rm-assistant"><form onSubmit={submit}><label htmlFor="rm-command">Ask the room assistant</label><div className="rm-input-row"><input id="rm-command" value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder="Try “pick touchdown”" /><button className="rm-primary" disabled={busy || sending || !text.trim()}>{sending ? 'Sending…' : 'Send'}</button><button type="button" disabled={!canSpeak || busy || sending} aria-pressed={listening} aria-label={listening ? 'Stop microphone' : 'Speak command'} onClick={listen}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>{listening ? 'Stop' : 'Speak'}</button></div></form><div className="rm-assistant-state" role="status">{speechError || (listening ? 'Listening…' : sending ? 'Sending…' : !canSpeak ? 'Voice unavailable · Type your request' : 'Type or speak your request')}</div>{request && <div className="rm-assistant-reply"><p>You: {request}</p><p role="status">{reply}</p></div>}</section>;
}
