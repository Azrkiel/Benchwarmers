import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { ToolCallTrace } from '@shared/types';
import { describeSpeechError, getRecognizerFactory, type RecognizerLike } from '../device/speech';
import { createBrowserMcp, type DeviceMcp } from '../device/mcpBrowser';
import { TracePanel } from '../device/TracePanel';
import { useSpeechOutput } from '../device/useSpeechOutput';
import { BEZEL, fitBox, SIZES, type DisplaySize } from '../display/DisplayPage';
import { sharedAudio } from '../fx/audio';
import { roomCredentials } from './api';
import type { DisplayLayout } from './RoomDisplay';
import { RoomDisplayScreen, type ViewRequest } from './RoomDisplayPage';
import { voiceInputProblem } from './RoomAssistant';
import { useRoom } from './useRoom';
import '../display/display.css';
import '../device/device.css';

const LAYOUT_FOR: Record<DisplaySize, DisplayLayout> = { compact: 'compact', small: 'medium', large: 'tv' };
export const ROOM_PROMPTS = ["What's the score?", 'Who has the ball?', "What's my rank?", 'I choose three', 'Show standings'];
type Speaker = 'guest' | 'seat';
type AskReply = { reply: string; accepted?: boolean; navigate?: string };

function useWindowSize() {
  const read = () => ({ w: window.innerWidth || 1536, h: window.innerHeight || 864 });
  const [size, setSize] = useState(read);
  useEffect(() => { const on = () => setSize(read()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return size;
}
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
const textOf = (r: { content?: { type: string; text?: string }[] }) => r.content?.find((c) => c.type === 'text')?.text ?? '';

/**
 * Simulated smart display for a game room. The room display runs at a real device
 * preset size inside a generic bezel; the talk bar sends requests through the actual
 * MCP endpoint (tools/list once, then tools/call room_ask) and shows each call. It is a
 * browser simulation: no Alexa device or skill is involved, and the page says so.
 */
export function RoomSimulatorPage({ mcp: injected }: { mcp?: DeviceMcp } = {}) {
  const code = (useParams().code ?? '').toUpperCase();
  const [params, setParams] = useSearchParams();
  const clean = params.get('clean') === '1';
  const requestedSize = params.get('size');
  const size: DisplaySize = requestedSize === 'large' || requestedSize === 'compact' ? requestedSize : requestedSize === 'small' ? 'small' : 'compact';
  const dims = SIZES[size];
  const setSize = (next: DisplaySize) => { const copy = new URLSearchParams(params); copy.set('size', next); setParams(copy, { replace: true }); };
  const credentials = roomCredentials(code);
  // The seat this browser holds (if any) — the only participant the simulator may act for.
  const seat = useRoom(code, false, !!credentials.participantToken).view?.me;
  const [speaker, setSpeaker] = useState<Speaker>('guest');
  const mcp = useMemo(() => injected ?? createBrowserMcp(), [injected]);
  const [trace, setTrace] = useState<ToolCallTrace[]>([]);
  const [showTrace, setShowTrace] = useState(params.get('trace') === '1');
  const [reply, setReply] = useState('');
  const [heard, setHeard] = useState('');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [viewRequest, setViewRequest] = useState<ViewRequest>();
  const recognizer = useRef<RecognizerLike | null>(null);
  const spaceHeld = useRef(false);
  const output = useSpeechOutput({ storageKey: 'bw.simulator.voiceMuted' });
  const audio = sharedAudio();
  useEffect(() => { audio.setSpeaking(listening || output.speaking); }, [audio, listening, output.speaking]);
  useEffect(() => { if (!reply) return; const t = setTimeout(() => setReply(''), 9000); return () => clearTimeout(t); }, [reply]);
  useEffect(() => () => { void mcp.close(); }, [mcp]);

  const record = (entry: ToolCallTrace) => setTrace((list) => [entry, ...list].slice(0, 20));
  useEffect(() => {
    let active = true;
    const started = performance.now();
    void (mcp.listTools?.() ?? Promise.resolve<string[]>([])).then((names) => {
      if (active) record({ name: 'tools/list', args: {}, ok: true, summary: `${names.length} tools${names.includes('room_ask') ? ', including room_ask' : ''}`, ms: Math.round(performance.now() - started) });
    }).catch(() => { if (active) record({ name: 'tools/list', args: {}, ok: false, summary: 'MCP endpoint unreachable', ms: Math.round(performance.now() - started) }); });
    return () => { active = false; };
  }, [mcp]);

  const ask = useCallback(async (raw: string, _spoken: boolean) => {
    const value = raw.trim();
    if (!value || pending) return;
    setPending(true); setHeard(value); setReply(''); output.cancel();
    const args: Record<string, unknown> = { code, text: value };
    if (speaker === 'seat' && credentials.participantToken) args.participantToken = credentials.participantToken;
    if (credentials.hostToken) args.hostToken = credentials.hostToken;
    const started = performance.now();
    try {
      const result = await mcp.callTool('room_ask', args);
      const data = result.structuredContent as AskReply | undefined;
      const said = data?.reply ?? (textOf(result) || 'Could not complete that request.');
      // Credentials never appear in the visible trace.
      record({ name: 'room_ask', args: { code, text: value, actor: args.participantToken ? `seat: ${seat?.name ?? 'this browser'}` : 'guest', host: !!args.hostToken }, ok: !result.isError, summary: said, ms: Math.round(performance.now() - started) });
      setReply(said); setText('');
      output.speak(said); // the simulated device answers out loud (muteable), like a voice device
      if (data?.navigate === 'standings' || data?.navigate === 'season') setViewRequest((r) => ({ view: data.navigate === 'season' ? 'results' : 'standings', seq: (r?.seq ?? 0) + 1 }));
    } catch {
      record({ name: 'room_ask', args: { code, text: value }, ok: false, summary: 'Request failed; nothing was retried.', ms: Math.round(performance.now() - started) });
      setReply('Could not confirm that request. Check the screen before trying again.');
    } finally { setPending(false); }
  }, [code, credentials.hostToken, credentials.participantToken, mcp, output, pending, seat?.name, speaker]);

  const problem = voiceInputProblem();
  const startListening = useCallback(() => {
    const factory = getRecognizerFactory(window);
    if (!factory || problem || listening || pending) return;
    output.cancel();
    const recognition = factory(); recognizer.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => { const r = event.results[event.resultIndex]; if (r?.isFinal) void ask(r[0]?.transcript ?? '', true); };
    recognition.onerror = (event) => { setMicError(describeSpeechError(event.error)); setListening(false); };
    recognition.onend = () => setListening(false);
    try { setMicError(''); setListening(true); recognition.start(); } catch { setMicError('Microphone could not start. Type instead.'); setListening(false); }
  }, [ask, listening, output, pending, problem]);
  const stopListening = () => recognizer.current?.stop();

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code !== 'Space' || isTyping(e.target)) return; e.preventDefault(); if (e.repeat || spaceHeld.current) return; spaceHeld.current = true; startListening(); };
    const up = (e: KeyboardEvent) => { if (e.code !== 'Space' || !spaceHeld.current) return; e.preventDefault(); spaceHeld.current = false; stopListening(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [startListening]);

  const win = useWindowSize();
  const topH = clean ? 0 : 52;
  const botH = clean ? 0 : 104;
  const sideW = !clean && showTrace ? Math.min(380, Math.round(win.w * 0.3)) : 0;
  const pad = clean ? 12 : 8;
  const fit = fitBox(win.w - sideW - pad * 2, Math.max(200, win.h - topH - botH - pad * 2), dims.w + BEZEL * 2, dims.h + BEZEL * 2);
  function submit(event: FormEvent) { event.preventDefault(); void ask(text, false); }

  return <div className="sd-root sim-root" data-size={size}>
    {!clean && <header className="sd-top" style={{ height: topH }}>
      <span className="sd-label">Simulated smart display · Room {code}</span>
      <div className="sd-sizes" role="group" aria-label="Screen size">{(Object.keys(SIZES) as DisplaySize[]).map((s) => <button key={s} type="button" aria-pressed={size === s} className={size === s ? 'is-on' : ''} onClick={() => setSize(s)}>{SIZES[s].label}</button>)}</div>
      <div className="sim-tools">
        <label className="sim-speaker">Speaking as <select value={speaker} onChange={(e) => setSpeaker(e.target.value as Speaker)}>
          <option value="guest">Guest (public questions)</option>
          {credentials.participantToken && <option value="seat">{seat?.name ?? 'My seat'} (this browser)</option>}
        </select></label>
        <button type="button" className="sim-trace-toggle" aria-pressed={showTrace} onClick={() => setShowTrace(!showTrace)}>MCP calls</button>
      </div>
    </header>}
    <div className="sd-stage" style={{ top: topH + pad, bottom: botH + pad, left: pad, right: sideW + pad }}>
      <div className="sd-bezel" style={{ width: dims.w + BEZEL * 2, height: dims.h + BEZEL * 2, padding: BEZEL, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}>
        <div className={`sd-screen is-${size}${listening ? ' is-listening' : ''}`} style={{ width: dims.w, height: dims.h, cursor: 'default' }} data-testid="sim-screen">
          <RoomDisplayScreen code={code} layout={LAYOUT_FOR[size]} embedded reply={reply} viewRequest={viewRequest} />
          {(listening || pending) && <div className="sim-listen" aria-live="polite">{listening ? 'Listening…' : `“${heard}”`}</div>}
        </div>
      </div>
    </div>
    {!clean && showTrace && <aside className="sim-trace" style={{ top: topH, width: sideW }} aria-label="MCP calls"><h2>MCP calls</h2><p className="sim-note">Real Streamable HTTP calls to this server's MCP endpoint. Credentials are hidden.</p><TracePanel calls={trace} /></aside>}
    {!clean && <footer className="sd-bottom sim-bottom" style={{ height: botH }}>
      <div className="sd-chips">{ROOM_PROMPTS.map((p) => <button key={p} type="button" disabled={pending} onClick={() => { void ask(p, false); }}>{p}</button>)}</div>
      <form className="sd-type" onSubmit={submit}>
        <button type="button" className="sim-mic" aria-pressed={listening} disabled={!!problem || pending} title={problem || undefined} onClick={() => (listening ? stopListening() : startListening())}>{listening ? 'Stop' : 'Talk'}</button>
        <input aria-label="Ask the display" value={text} onChange={(e) => setText(e.target.value)} placeholder={problem ? 'Type a request' : 'Type, or hold Space to talk'} />
        <button disabled={pending || !text.trim()}>{pending ? 'Sending…' : 'Send'}</button>
      </form>
      <p className="sim-status" role="status">{micError || (speaker === 'guest' ? 'Guest: score, possession and standings. Choose your seat to make picks.' : `Acting for ${seat?.name ?? 'this browser'}'s seat.`)}</p>
    </footer>}
  </div>;
}
