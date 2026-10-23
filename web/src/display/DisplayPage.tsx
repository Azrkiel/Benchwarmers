import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePartyState } from '../lib/usePartyState';
import { FallbackCard } from '../device/FallbackCard';
import { mergeModel, modelFromState, modelFromStructured } from '../device/fallbackModel';
import { membersFor } from '../device/members';
import { useDeviceAssistant } from '../device/useDeviceAssistant';
import { useSpeaker } from '../device/useSpeaker';
import { useSpeechInput } from '../device/useSpeechInput';
import { useSpeechOutput } from '../device/useSpeechOutput';
import { WidgetHost, type WidgetStatus } from '../device/WidgetHost';
import type { DeviceDeps } from '../device/DevicePage';
import './display.css';

export type DisplaySize = 'small' | 'large';

export const SIZES: Record<DisplaySize, { w: number; h: number; label: string }> = {
  small: { w: 1280, h: 800, label: 'Small 1280x800' },
  large: { w: 1920, h: 1080, label: 'Large 1920x1080' },
};

export const BEZEL = 28;
/** Quick prompts. `say` is what is sent when it differs from the label (offline router needs a name). */
export const PROMPTS: { label: string; say?: string }[] = [
  { label: 'Draft Big Mo for Maya', say: "I'm Maya, draft Big Mo" },
  { label: "Who's winning?" },
  { label: "Who's available at center?" },
  { label: "What's the score?" },
];

/** Scale a w x h box to fit inside the area, centred. */
export function fitBox(areaW: number, areaH: number, w: number, h: number) {
  const scale = Math.max(0.1, Math.min(areaW / w, areaH / h));
  return { scale, x: (areaW - w * scale) / 2, y: (areaH - h * scale) / 2 };
}

function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const t = setInterval(() => setNow(fmt()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useWindowSize() {
  const read = () => ({ w: window.innerWidth || 1536, h: window.innerHeight || 864 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export function DisplayPage() {
  const { household = '' } = useParams<{ household: string }>();
  return <DisplayScreen household={household} />;
}

export function DisplayScreen({ household, deps = {} }: { household: string; deps?: DeviceDeps }) {
  const [params, setParams] = useSearchParams();
  const clean = params.get('clean') === '1';
  const size: DisplaySize = params.get('size') === 'large' ? 'large' : 'small';
  const dims = SIZES[size];
  const setSize = (s: DisplaySize) => {
    const next = new URLSearchParams(params);
    if (s === 'small') next.delete('size');
    else next.set('size', s);
    setParams(next, { replace: true });
  };

  const win = useWindowSize();
  const clock = useClock();

  const assistant = useDeviceAssistant(household, { send: deps.send });
  const party = usePartyState(assistant.partyCode ?? 'latest');
  const state = party.state;
  const members = membersFor(household, state);
  const speaker = useSpeaker(household, members, { voice: deps.voice, capture: deps.capture });
  const speech = useSpeechOutput({ synth: deps.synth, makeUtterance: deps.makeUtterance });

  const [draft, setDraft] = useState('');
  const sending = useRef(false);
  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus>('loading');
  const [widgetStructured, setWidgetStructured] = useState<Record<string, unknown> | undefined>(undefined);
  useEffect(() => {
    setWidgetStructured(undefined);
  }, [assistant.uiResource]);

  const speechInput = useSpeechInput({
    factory: deps.recognizerFactory,
    onFinal: () => undefined,
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

  const { listening, start, stop } = speechInput;
  const pending = assistant.pending;
  const beginListening = useCallback(() => {
    if (listening || pending) return;
    speech.cancel();
    void speaker.begin();
    start();
  }, [listening, pending, speech, speaker, start]);
  const toggleListening = () => (listening ? stop() : beginListening());

  // Space = push to talk (hold). Typing fields keep their own space.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      e.preventDefault();
      if (!e.repeat) beginListening();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      e.preventDefault();
      if (listening) stop();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [beginListening, listening, stop]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || sending.current || assistant.pending) return false;
    sending.current = true;
    speech.cancel();
    const res = await assistant.send(t, speaker.speakerForTyped());
    sending.current = false;
    if (res) speech.speak(res.reply);
    return !!res;
  };
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await ask(draft)) setDraft('');
  };

  const lastUser = [...assistant.turns].reverse().find((t) => t.role === 'user');
  const lastAssistant = [...assistant.turns].reverse().find((t) => t.role === 'assistant');
  const caption = listening ? speechInput.interim || 'Listening' : lastUser?.text;
  const reply = pending || listening ? undefined : lastAssistant?.text;
  const code = assistant.partyCode ?? state?.party.code;
  const showWidget = assistant.uiResource !== undefined;
  const widgetFailed = showWidget && widgetStatus === 'error';
  const structured = widgetStructured ?? assistant.structured;
  const model = mergeModel(modelFromStructured(structured), modelFromState(state));
  const idle = !caption && !reply && !pending && !showWidget;
  const note = speechInput.error ?? speaker.note;

  // Outside chrome (label above, prompts below) is dropped by ?clean=1.
  const topH = clean ? 0 : 44;
  const botH = clean ? 0 : 92;
  const pad = clean ? 12 : 0;
  const fit = fitBox(win.w - pad * 2, Math.max(200, win.h - topH - botH - pad * 2), dims.w + BEZEL * 2, dims.h + BEZEL * 2);

  return (
    <div className={`sd-root${clean ? ' is-clean' : ''}`} data-testid="display-root" data-size={size}>
      {clean ? null : (
        <header className="sd-top" style={{ height: topH }}>
          <span className="sd-label">Simulated smart display</span>
          <div className="sd-sizes" role="group" aria-label="Screen size">
            {(Object.keys(SIZES) as DisplaySize[]).map((s) => (
              <button key={s} type="button" aria-pressed={size === s} className={size === s ? 'is-on' : ''} onClick={() => setSize(s)}>
                {SIZES[s].label}
              </button>
            ))}
          </div>
        </header>
      )}

      <div className="sd-stage" style={{ top: topH + pad, bottom: botH + pad, left: pad, right: pad }}>
        <div
          className="sd-bezel"
          data-testid="display-bezel"
          style={{
            width: dims.w + BEZEL * 2,
            height: dims.h + BEZEL * 2,
            padding: BEZEL,
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
          }}
        >
          <div
            className={`sd-screen is-${size}${showWidget ? ' has-widget' : ''}${listening ? ' is-listening' : ''}`}
            style={{ width: dims.w, height: dims.h }}
            data-testid="display-screen"
            onClick={toggleListening}
          >
            <div className="sd-status">
              <span className="sd-time" data-testid="display-time" hidden={idle}>{clock}</span>
              {code ? <span className="sd-party">Party {code}</span> : null}
            </div>

            {idle ? (
              <div className="sd-idle" data-testid="display-idle">
                <div className="sd-clock">{clock}</div>
                <p className="sd-hint">Ask: &ldquo;Who&rsquo;s winning?&rdquo;</p>
                <p className="sd-hint2">Hold Space or tap to talk</p>
              </div>
            ) : (
              <div className="sd-convo">
                {caption ? <p className="sd-caption" data-testid="display-caption">{caption}</p> : null}
                {pending ? <p className="sd-reply is-thinking" aria-live="polite">Sending&hellip;</p> : null}
                {reply ? (
                  <p
                    className={`sd-reply${lastAssistant?.error ? ' is-error' : ''}${reply.length > 140 ? ' is-long' : ''}`}
                    data-testid="display-reply"
                    aria-live="polite"
                  >
                    {reply}
                  </p>
                ) : null}
              </div>
            )}

            {showWidget && assistant.uiResource ? (
              <div className="sd-widget" data-ready={widgetStatus === 'ready' ? 'true' : 'false'} onClick={(e) => e.stopPropagation()}>
                <WidgetHost
                  uiResource={assistant.uiResource}
                  partyCode={code}
                  stateVersion={state?.version}
                  mcp={deps.mcp}
                  createBridge={deps.createBridge}
                  onStatus={(s) => setWidgetStatus(s)}
                  onResult={(sc) => setWidgetStructured(sc)}
                />
                {widgetFailed ? (
                  <div className="sd-fallback">
                    <FallbackCard model={model} householdId={household} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="sd-lightbar" aria-hidden="true" data-testid="display-lightbar" data-active={listening ? 'true' : 'false'} />
          </div>
        </div>
      </div>

      {clean ? null : (
        <footer className="sd-bottom" style={{ height: botH }}>
          <div className="sd-chips" role="group" aria-label="Quick prompts">
            {PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={pending}
                onClick={(e) => {
                  e.currentTarget.blur();
                  void ask(p.say ?? p.label);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <form className="sd-type" onSubmit={onSubmit}>
            <input
              type="text"
              aria-label="Type a request"
              data-testid="display-input"
              placeholder="Type or hold Space to talk"
              autoComplete="off"
              readOnly={pending}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={!draft.trim() || pending}>Send</button>
          </form>
          {note ? <p className="sd-note">{note}</p> : null}
        </footer>
      )}
    </div>
  );
}
