import { useEffect, useRef, useState, type FormEvent } from 'react';
import { describeSpeechError, getRecognizerFactory, type RecognizerLike } from '../device/speech';
import { useSpeechOutput } from '../device/useSpeechOutput';
import type { SharedAudio } from '../fx/audio';

export type AssistantReply = { reply: string; accepted?: boolean; navigate?: string };

/** Why voice input is unavailable here, or '' when it should work. */
export function voiceInputProblem(win: { isSecureContext?: boolean } = window): string {
  if (win.isSecureContext === false) return 'Voice needs a secure (https) page. Type your request.';
  if (!getRecognizerFactory(win)) return 'Voice input is not supported in this browser. Type your request.';
  return '';
}

/**
 * Typed or spoken room requests. Spoken requests get a spoken reply (unless muted);
 * any sound on this screen yields while the microphone listens or the reply plays.
 * A failed send is never retried automatically, so an accepted command cannot repeat.
 */
export function RoomAssistant({ busy, onCommand, onNavigate, audio, placeholder = 'Try “I choose three” or “what’s my rank?”', label = 'Ask assistant' }: {
  busy: boolean; onCommand: (text: string) => Promise<AssistantReply | string | undefined>; onNavigate?: (view: string) => void; audio?: SharedAudio; placeholder?: string; label?: string;
}) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [sending, setSending] = useState(false);
  const [request, setRequest] = useState('');
  const recognizer = useRef<RecognizerLike | null>(null);
  const mounted = useRef(true);
  const command = useRef(onCommand); command.current = onCommand;
  const output = useSpeechOutput({ storageKey: 'bw.room.voiceMuted' });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recognizer.current?.abort(); }; }, []);
  useEffect(() => { audio?.setSpeaking(listening || output.speaking); }, [audio, listening, output.speaking]);
  async function send(value: string, spoken: boolean) {
    if (!value.trim() || busy || sending) return;
    setSending(true); setRequest(value.trim()); setReply('');
    try {
      const response = await command.current(value.trim());
      if (!mounted.current) return;
      const result = typeof response === 'string' ? { reply: response } : response;
      if (!result) { setReply('Could not confirm that request. Check the game view before trying again.'); return; }
      setReply(result.reply); setText('');
      if (spoken) output.speak(result.reply);
      if (result.navigate) onNavigate?.(result.navigate);
    } catch { if (mounted.current) setReply('Could not confirm that request. Check the game view before trying again.'); }
    finally { if (mounted.current) setSending(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(text, false); }
  const problem = voiceInputProblem();
  function listen() {
    if (listening) { recognizer.current?.stop(); return; }
    const factory = getRecognizerFactory(window); if (!factory || problem) return;
    output.cancel(); // Never talk over the person speaking.
    const recognition = factory(); recognizer.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex]; if (!result?.isFinal || !mounted.current) return;
      const value = result[0]?.transcript ?? ''; setText(value); void send(value, true);
    };
    recognition.onerror = (event) => { if (mounted.current) { setSpeechError(describeSpeechError(event.error)); setListening(false); } };
    recognition.onend = () => { if (mounted.current) setListening(false); };
    try { setSpeechError(''); setListening(true); recognition.start(); }
    catch { setSpeechError('Microphone could not start. Type your request instead.'); setListening(false); }
  }
  const status = speechError || (listening ? 'Listening…' : sending ? 'Sending…' : problem || (!output.supported ? 'Replies show as text (speech output unavailable).' : 'Type or speak your request'));
  return <section className="rm-assistant"><form onSubmit={submit}><label htmlFor="rm-command">{label}</label><div className="rm-input-row">
    <input id="rm-command" value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder={placeholder} />
    <button className="rm-primary" disabled={busy || sending || !text.trim()}>{sending ? 'Sending…' : 'Send'}</button>
    <button type="button" disabled={!!problem || busy || sending} aria-pressed={listening} aria-label={listening ? 'Stop microphone' : 'Speak command'} onClick={listen}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>{listening ? 'Stop' : 'Speak'}</button>
    {output.supported && <button type="button" aria-pressed={output.muted} onClick={output.toggleMute} aria-label={output.muted ? 'Unmute spoken replies' : 'Mute spoken replies'}>{output.muted ? 'Replies muted' : 'Replies on'}</button>}
  </div></form>
  <div className="rm-assistant-state" role="status">{status}</div>
  {request && <div className="rm-assistant-reply"><p>You: {request}</p><p role="status">{reply}</p></div>}</section>;
}
