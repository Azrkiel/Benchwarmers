import { useEffect, useState, type FormEvent } from 'react';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
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
    if (!text) return;
    setDraft('');
    speech.cancel();
    const res = await assistant.send(text, speaker.speakerForTyped());
    if (res) speech.speak(res.reply);
  };

  const code = partyCode ?? state?.party.code;
  const mode = assistant.lastResponse?.mode;
  const structured = widgetStructured ?? assistant.structured;
  const model = mergeModel(modelFromStructured(structured), modelFromState(state));
  const showWidget = assistant.uiResource !== undefined;
  const showFallback = !showWidget || widgetStatus !== 'ready';
  const notice = speaker.note ?? speechInput.error ?? (speechInput.supported ? undefined : UNSUPPORTED);

  return (
    <div className="device-stage">
      <div className="device-bezel" data-testid="device-bezel">
        <header className="ds-head">
          <div className="ds-head-left">
            <BrandLockup size={22} />
            <h1 className="ds-household" data-testid="household-name">
              {householdName(household, state)}
            </h1>
            <span className="party-chip" data-testid="party-code" aria-label="Party code">
              {code ?? '…'}
            </span>
            {mode ? (
              <span className={`mode-badge mode-${mode}`} data-testid="mode-badge">
                {mode}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="ds-gear"
            aria-label="Settings"
            data-testid="settings-button"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </header>

        <div className="ds-body">
          <section className="ds-left" aria-label="Conversation">
            <Transcript
              turns={assistant.turns}
              pending={assistant.pending}
              listening={speechInput.listening}
              interim={speechInput.interim}
            />
            <div className="ds-input-area">
              <div className="ds-mic-wrap">
                <button
                  type="button"
                  className={`ds-mic${speechInput.listening ? ' is-listening' : ''}`}
                  aria-label="Talk to the assistant"
                  aria-pressed={speechInput.listening}
                  data-testid="mic-button"
                  disabled={!speechInput.supported}
                  title={speechInput.supported ? undefined : UNSUPPORTED}
                  onClick={onMic}
                >
                  <span className="ds-mic-ring" aria-hidden="true" />
                  <span className="ds-mic-icon" aria-hidden="true">●</span>
                </button>
                <p className="ds-mic-hint">Tap to talk</p>
              </div>
              <form className="ds-type" onSubmit={onSubmit}>
                <input
                  className="ds-input"
                  data-testid="chat-input"
                  type="text"
                  aria-label="Type a message"
                  placeholder="Type a message…"
                  autoComplete="off"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="ds-send" data-testid="send-button" disabled={!draft.trim()}>
                  Send
                </button>
              </form>
            </div>
            <div className="ds-under">
              <SpeakerBar
                members={members}
                screenPick={speaker.screenPick}
                onPick={speaker.setScreenPick}
                recognized={speaker.recognized}
              />
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

        <footer className="ds-foot">
          <label className="trace-toggle">
            <input
              type="checkbox"
              aria-label="Show agent trace"
              data-testid="trace-toggle"
              checked={showTrace}
              onChange={(e) => setShowTrace(e.target.checked)}
            />
            Show agent trace
          </label>
          {showTrace ? <TracePanel calls={assistant.lastResponse?.toolCalls ?? []} /> : null}
        </footer>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        members={members}
        voice={speaker.voice}
        muted={speech.muted}
        onToggleMute={speech.toggleMute}
        partyCode={code ?? '…'}
        householdName={householdName(household, state)}
      />
    </div>
  );
}
