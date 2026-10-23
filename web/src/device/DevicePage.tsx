import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { AssistantRequest, AssistantResponse } from '@shared/types';
import type { VoiceId } from '../voiceid';
import { usePartyState } from '../lib/usePartyState';
import { FallbackCard } from './FallbackCard';
import { mergeModel, modelFromState, modelFromStructured } from './fallbackModel';
import type { DeviceMcp } from './mcpBrowser';
import { householdName, membersFor } from './members';
import { SettingsDrawer } from './SettingsDrawer';
import { SpeakerBar } from './SpeakerBar';
import { TracePanel } from './TracePanel';
import { Transcript } from './Transcript';
import { useDeviceAssistant } from './useDeviceAssistant';
import { useSpeaker, type CaptureLike } from './useSpeaker';
import { useSpeechInput } from './useSpeechInput';
import { useSpeechOutput } from './useSpeechOutput';
import type { RecognizerFactory, SynthLike } from './speech';
import { WidgetHost, type BridgeFactory, type WidgetStatus } from './WidgetHost';
import './device.css';
import { BrandLockup } from '../brand/Brand';

const UNSUPPORTED = "Voice input isn't supported in this browser. Type instead.";

/** Test seams. Omit everything in production. */
export type DeviceDeps = {
  send?: (req: AssistantRequest) => Promise<AssistantResponse>;
  recognizerFactory?: RecognizerFactory | null;
  synth?: SynthLike | null;
  makeUtterance?: (text: string) => object | null;
  voice?: VoiceId;
  capture?: CaptureLike;
  mcp?: DeviceMcp;
  createBridge?: BridgeFactory;
};

export function DevicePage() {
  const { household = '' } = useParams<{ household: string }>();
  return <DeviceScreen household={household} />;
}

export function DeviceScreen({ household, deps = {} }: { household: string; deps?: DeviceDeps }) {
  const assistant = useDeviceAssistant(household, { send: deps.send });
  const partyCode = assistant.partyCode;
  const party = usePartyState(partyCode ?? 'latest');
  const state = party.state;
  const members = membersFor(household, state);
  const speaker = useSpeaker(household, members, { voice: deps.voice, capture: deps.capture });
  const speech = useSpeechOutput({ synth: deps.synth, makeUtterance: deps.makeUtterance });

  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [conversationPref, setConversationPref] = useState<boolean | undefined>(undefined);
  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus>('loading');
  const [widgetStructured, setWidgetStructured] = useState<Record<string, unknown> | undefined>(undefined);

  // A new widget payload supersedes what the previous widget reported.
  useEffect(() => {
    setWidgetStructured(undefined);
  }, [assistant.uiResource]);

  const speechInput = useSpeechInput({
    factory: deps.recognizerFactory,
    onFinal: () => undefined,
    // onEnd, not onFinal: the clip must stop before the request goes out.
    onEnd: (finalText) => {
      void (async () => {
        const hint = await speaker.finish();
        const text = finalText.trim();
        if (!text) return;
        const res = await assistant.send(text, hint);
        if (res) speech.speak(res.reply);
      })();
    },
  });

  const onMic = () => {
    if (speechInput.listening) {
      speechInput.stop();
      return;
    }
    speech.cancel();
    void speaker.begin(); // not awaited: recognition must start inside this click
    speechInput.start();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending.current || assistant.pending) return;
    sending.current = true;
    speech.cancel();
    const res = await assistant.send(text, speaker.speakerForTyped());
    if (res) { setDraft(''); speech.speak(res.reply); }
    sending.current = false;
  };

  // Phones: conversation is collapsed until there are messages, unless the user chose.
  const conversationOpen = conversationPref ?? assistant.turns.length > 0;
  const code = partyCode ?? state?.party.code;
  const mode = assistant.lastResponse?.mode;
  const structured = widgetStructured ?? assistant.structured;
  const model = mergeModel(modelFromStructured(structured), modelFromState(state));
  const showWidget = assistant.uiResource !== undefined;
  const showFallback = !showWidget || widgetStatus !== 'ready';
  const notice = speaker.note ?? speechInput.error ?? (speechInput.supported ? undefined : UNSUPPORTED);

  return (
    <div className="device-stage">
      <div className="device-bezel" data-testid="device-bezel" inert={settingsOpen}>
        <header className="ds-head">
          <div className="ds-head-left">
            <a href="/" aria-label="Benchwarmers home"><BrandLockup size={22} /></a>
            <h1 className="ds-household" data-testid="household-name">
              {householdName(household, state)}
            </h1>
            <span className="party-chip" data-testid="party-code" aria-label="Party code">
              {code ? `Party ${code}` : 'No party selected'}
            </span>
            {code ? <a className="ds-tv-link" href={`/tv/${encodeURIComponent(code)}`}>TV view</a> : null}
          </div>
          <button
            type="button"
            className="ds-gear"
            aria-label="Settings"
            data-testid="settings-button"
            onClick={() => setSettingsOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></svg>
          </button>
        </header>

        <div className="ds-body">
          <section className="ds-left" aria-label="Conversation">
            <div className="ds-suggestions" aria-label="Suggested messages">{["Who's available?", 'Show standings', 'Show season standings', 'Show my roster'].map(text => <button key={text} type="button" disabled={assistant.pending} onClick={() => { setDraft(text); input.current?.focus(); }}>{text}</button>)}</div>
            {code ? null : <p className="ds-hint" data-testid="party-hint">No party yet. Say or type &ldquo;Set up a party&rdquo; to create one, or open a party link to join.</p>}
            <button className="ds-conversation-toggle" type="button" aria-expanded={conversationOpen} aria-controls="device-conversation" onClick={() => setConversationPref(!conversationOpen)}>Conversation {assistant.turns.length ? `(${assistant.turns.length})` : ''}</button>
            <div className="ds-transcript-wrap" id="device-conversation" data-open={conversationOpen ? "true" : "false"}><Transcript
              turns={assistant.turns}
              pending={assistant.pending}
              listening={speechInput.listening}
              interim={speechInput.interim}
            /></div>
            <div className="ds-identity"><SpeakerBar members={members} screenPick={speaker.screenPick} onPick={speaker.setScreenPick} recognized={speaker.recognized} /></div>
            <div className="ds-input-area">
              <div className="ds-mic-wrap">
                <button
                  type="button"
                  className={`ds-mic${speechInput.listening ? ' is-listening' : ''}`}
                  aria-label="Talk to the assistant"
                  aria-pressed={speechInput.listening}
                  data-testid="mic-button"
                  disabled={!speechInput.supported || assistant.pending}
                  title={speechInput.supported ? undefined : UNSUPPORTED}
                  onClick={onMic}
                >
                  <span className="ds-mic-ring" aria-hidden="true" />
                  <svg className="ds-mic-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>
                </button>
                <p className="ds-mic-hint" data-testid="mic-hint" role="status">{assistant.pending ? 'Sending…' : speechInput.listening ? 'Listening… Tap to stop' : 'Talk'}</p>
              </div>
              <form className="ds-type" onSubmit={onSubmit}>
                <input
                  ref={input}
                  className="ds-input"
                  data-testid="chat-input"
                  type="text"
                  aria-label="Type a message"
                  placeholder="Type a message…"
                  autoComplete="off"
                  readOnly={assistant.pending}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="ds-send" data-testid="send-button" disabled={!draft.trim() || assistant.pending}>
                  {assistant.pending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </div>
            {assistant.error && draft ? <p className="ds-retry" role="status">Message not sent. Your text is ready to retry with Send.</p> : null}
            <div className="ds-under">
              {notice ? (
                <p className="ds-notice" data-testid="notice">
                  {notice}
                </p>
              ) : null}
            </div>
          </section>

          <section className="ds-right" aria-label="Board">
            {showWidget && assistant.uiResource ? (
              <div className="ds-widget" data-ready={widgetStatus === 'ready' ? 'true' : 'false'}>
                <WidgetHost
                  uiResource={assistant.uiResource}
                  partyCode={code}
                  stateVersion={state?.version}
                  mcp={deps.mcp}
                  createBridge={deps.createBridge}
                  onStatus={(s) => setWidgetStatus(s)}
                  onResult={(sc) => setWidgetStructured(sc)}
                />
              </div>
            ) : null}
            {showFallback ? <FallbackCard model={model} householdId={household} /> : null}
          </section>
        </div>


      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        members={members}
        voice={speaker.voice}
        muted={speech.muted}
        onToggleMute={speech.toggleMute}
        partyCode={code}
        diagnostics={<>

          {mode ? <p>Assistant mode: <span className={`mode-badge mode-${mode}`} data-testid="mode-badge">{mode}</span></p> : null}
          <label className="trace-toggle">
            <input
              type="checkbox"
              aria-label="Tool activity"
              data-testid="trace-toggle"
              checked={showTrace}
              onChange={(e) => setShowTrace(e.target.checked)}
            />
            Tool activity
          </label>
          {showTrace ? <TracePanel calls={assistant.lastResponse?.toolCalls ?? []} /> : null}
          
        </>}
        householdName={householdName(household, state)}
      />
    </div>
  );
}
