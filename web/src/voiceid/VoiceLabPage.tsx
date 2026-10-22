import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Member } from '@shared/types';
import { describeMicError, EnrollPanel } from './EnrollPanel';
import { DEFAULT_MATCH, type MatchOptions, type Ranked } from './match';
import { useUtteranceCapture } from './useUtteranceCapture';
import { useVoiceId } from './useVoiceId';
import './voiceid.css';
import { BrandLockup } from '../brand/Brand';

type Household = { id: string; label: string; members: Member[] };

const HOUSEHOLDS: Household[] = [
  {
    id: 'garcias',
    label: 'The Garcias',
    members: [
      { id: 'maya', name: 'Maya', avatar: 'M' },
      { id: 'leo', name: 'Leo', avatar: 'L' },
    ],
  },
  {
    id: 'sams-place',
    label: "Sam's Place",
    members: [
      { id: 'sam', name: 'Sam', avatar: 'S' },
      { id: 'priya', name: 'Priya', avatar: 'P' },
    ],
  },
];

export type NotSureReason = 'below-threshold' | 'small-margin' | 'too-short' | 'nobody-enrolled';

export type Verdict =
  | { accepted: true; top: Ranked; confidence: number }
  | { accepted: false; reason: NotSureReason; top?: Ranked };

/** Same rules as match.identify, applied to computed scores so sliders can re-judge without re-recording. */
export function verdictFor(ranked: Ranked[], opts: MatchOptions): Verdict {
  if (ranked.length === 0) return { accepted: false, reason: 'nobody-enrolled' };
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  const [top, second] = sorted;
  if (top.score < opts.threshold) return { accepted: false, reason: 'below-threshold', top };
  if (second && top.score - second.score < opts.margin) return { accepted: false, reason: 'small-margin', top };
  return { accepted: true, top, confidence: clamp01(top.score) };
}

type Last = { kind: 'too-short' } | { kind: 'scored'; ranked: Ranked[] };

const REASON_TEXT: Record<NotSureReason, string> = {
  'below-threshold': 'The best match is below the threshold.',
  'small-margin': 'Too close to the runner-up to tell apart.',
  'too-short': 'The clip was too short. Speak for 2–3 seconds.',
  'nobody-enrolled': 'Nobody is enrolled in this household yet.',
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const pct = (x: number) => `${(clamp01(x) * 100).toFixed(1)}%`;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function VoiceLabPage() {
  const [params] = useSearchParams();
  const forceFallback = params.get('backend') === 'mfcc';
  const [householdId, setHouseholdId] = useState(HOUSEHOLDS[0].id);
  const household = HOUSEHOLDS.find((h) => h.id === householdId) ?? HOUSEHOLDS[0];
  const voice = useVoiceId(household.id, { forceFallback });
  const who = useUtteranceCapture();
  const [last, setLast] = useState<Last | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [whoError, setWhoError] = useState<string | undefined>(undefined);

  const pickHousehold = (id: string) => {
    setHouseholdId(id);
    setLast(null);
    setWhoError(undefined);
  };

  const toggleWho = async () => {
    setWhoError(undefined);
    if (!who.recording) {
      try {
        await who.start();
      } catch (e) {
        setWhoError(describeMicError(messageOf(e)));
      }
      return;
    }
    setIdentifying(true);
    try {
      const clip = await who.stop();
      if (!clip) {
        setLast({ kind: 'too-short' });
      } else {
        const outcome = await voice.identifyDetailed(clip);
        setLast(outcome.tooShort ? { kind: 'too-short' } : { kind: 'scored', ranked: outcome.result?.ranked ?? [] });
      }
    } catch (e) {
      setWhoError(`Could not identify that clip: ${messageOf(e)}`);
    } finally {
      setIdentifying(false);
    }
  };

  const opts = voice.matchOptions;
  const defaults = DEFAULT_MATCH[voice.backend ?? 'wavlm'];
  const ranked = last?.kind === 'scored' ? last.ranked : [];
  const verdict: Verdict | null =
    last === null
      ? null
      : last.kind === 'too-short'
        ? { accepted: false, reason: 'too-short' }
        : verdictFor(ranked, opts);
  const sortedRanked = [...ranked].sort((a, b) => b.score - a.score);
  const level = Math.round(clamp01(who.level) * 100);

  const backendLabel =
    voice.backend === 'wavlm'
      ? 'WavLM speaker model (on-device)'
      : voice.backend === 'mfcc'
        ? 'MFCC fallback — lower accuracy'
        : 'Not loaded yet';
  const progressPct = Math.round(clamp01(voice.progress) * 100);

  return (
    <main className="vid-root vid-page">
      <header className="vid-head">
        <a href="/" aria-label="Benchwarmers home"><BrandLockup size={26} /></a>
        <h1>Voice ID lab</h1>
        <p className="vid-privacy">Everything stays on this device. No audio or voiceprints are sent to the server.</p>
      </header>

      <section className="vid-card" aria-labelledby="vid-household-title">
        <h2 id="vid-household-title">Household</h2>
        <div className="vid-segment" role="group" aria-label="Household">
          {HOUSEHOLDS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={h.id === household.id ? 'vid-btn vid-seg is-on' : 'vid-btn vid-seg'}
              aria-pressed={h.id === household.id}
              onClick={() => pickHousehold(h.id)}
            >
              {h.label}
            </button>
          ))}
        </div>
      </section>

      <section className="vid-card" aria-labelledby="vid-engine-title">
        <h2 id="vid-engine-title">Engine</h2>
        <dl className="vid-dl">
          <dt>Backend</dt>
          <dd>{backendLabel}</dd>
          <dt>Model</dt>
          <dd>{voice.modelId ?? '—'}</dd>
          <dt>Status</dt>
          <dd>{voice.status}</dd>
        </dl>
        {voice.status === 'loading' && (
          <progress className="vid-progress" value={progressPct} max={100} aria-label="Model download progress">
            {progressPct}%
          </progress>
        )}
        {voice.fallbackReason && <p className="vid-notice">Fell back to MFCC: {voice.fallbackReason}</p>}
        {voice.error && (
          <p className="vid-notice" role="alert">
            {voice.error}
          </p>
        )}
        <p className="vid-note">
          The first load downloads about 100 MB once. The browser then caches it, so later loads are quick.
        </p>
      </section>

      <EnrollPanel members={household.members} voice={voice} />

      <section className="vid-card" aria-labelledby="vid-who-title">
        <h2 id="vid-who-title">Who&apos;s talking?</h2>
        <button
          type="button"
          className={who.recording ? 'vid-btn vid-btn-stop vid-big-btn' : 'vid-btn vid-btn-primary vid-big-btn'}
          disabled={voice.status !== 'ready' || identifying}
          onClick={() => void toggleWho()}
        >
          {who.recording ? 'Stop' : identifying ? 'Matching…' : 'Record a voice'}
        </button>
        {who.recording && (
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
          </div>
        )}
        {whoError && (
          <p className="vid-notice" role="alert">
            {whoError}
          </p>
        )}

        {verdict && (
          <div className="vid-result" aria-live="polite">
            {verdict.accepted ? (
              <>
                <p className="vid-big vid-accepted">{verdict.top.memberName}</p>
                <p>{Math.round(verdict.confidence * 100)}% confidence</p>
              </>
            ) : (
              <>
                <p className="vid-big vid-not-sure">Not sure</p>
                <p>{REASON_TEXT[verdict.reason]}</p>
              </>
            )}
          </div>
        )}

        {sortedRanked.length > 0 && (
          <>
            <ol className="vid-ranked" aria-label="All members by similarity">
              {sortedRanked.map((r) => (
                <li key={r.memberId} className="vid-rank">
                  <span className="vid-rank-name">{r.memberName}</span>
                  <span className="vid-bar-track">
                    <span className="vid-bar" style={{ width: pct(r.score) }} />
                    <span className="vid-bar-threshold" style={{ left: pct(opts.threshold) }} title="Threshold" />
                  </span>
                  <span className="vid-rank-score">{r.score.toFixed(3)}</span>
                </li>
              ))}
            </ol>
            <p className="vid-note">The vertical line marks the threshold.</p>
          </>
        )}
      </section>

      <section className="vid-card" aria-labelledby="vid-cal-title">
        <h2 id="vid-cal-title">Calibration</h2>
        <div className="vid-slider">
          <div className="vid-slider-head">
            <label htmlFor="vid-threshold">Threshold</label>
            <output htmlFor="vid-threshold">{opts.threshold.toFixed(2)}</output>
          </div>
          <input
            id="vid-threshold"
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={opts.threshold}
            onChange={(e) => voice.setMatchOptions({ ...opts, threshold: Number(e.target.value) })}
          />
        </div>
        <div className="vid-slider">
          <div className="vid-slider-head">
            <label htmlFor="vid-margin">Margin</label>
            <output htmlFor="vid-margin">{opts.margin.toFixed(3)}</output>
          </div>
          <input
            id="vid-margin"
            type="range"
            min={0}
            max={0.2}
            step={0.005}
            value={opts.margin}
            onChange={(e) => voice.setMatchOptions({ ...opts, margin: Number(e.target.value) })}
          />
        </div>
        <button type="button" className="vid-btn" onClick={() => voice.setMatchOptions({ ...defaults })}>
          Reset to defaults
        </button>
      </section>
    </main>
  );
}
