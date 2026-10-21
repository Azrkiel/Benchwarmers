import { useCallback, useRef, useState } from 'react';
import type { Member, SpeakerHint } from '@shared/types';
import { storageKey, useUtteranceCapture, useVoiceId, type IdentifyOutcome, type VoiceId } from '../voiceid';

export type CaptureLike = {
  start(): Promise<void>;
  stop(): Promise<Float32Array | null>;
  recording: boolean;
  level: number;
  error?: string;
};

export type Recognized = { memberName: string; confidence: number; provisional: boolean; engine: string };

function hasEnrolled(householdId: string): boolean {
  try {
    const keys = [storageKey(householdId), `${storageKey(householdId)}.mfcc`];
    return keys.some((k) => {
      const v = localStorage.getItem(k);
      return !!v && v !== '[]' && v !== '{}';
    });
  } catch {
    return false;
  }
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function useSpeaker(
  householdId: string,
  members: Member[],
  deps: { voice?: VoiceId; capture?: CaptureLike } = {},
) {
  void members;
  const realVoice = useVoiceId(householdId, { autoLoad: !deps.voice && hasEnrolled(householdId) });
  const realCapture = useUtteranceCapture();
  const voice = deps.voice ?? realVoice;
  const capture: CaptureLike = deps.capture ?? realCapture;

  const [screenPick, setPick] = useState<string | undefined>(undefined);
  const [recognized, setRecognized] = useState<Recognized | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);

  const pickRef = useRef<string | undefined>(undefined);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const householdRef = useRef(householdId);
  householdRef.current = householdId;
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const setScreenPick = useCallback((name?: string) => {
    const next = name !== undefined && pickRef.current === name ? undefined : name;
    pickRef.current = next;
    setPick(next);
    if (next !== undefined) setRecognized(undefined);
  }, []);

  const screenHint = (): SpeakerHint | undefined =>
    pickRef.current ? { memberName: pickRef.current, confidence: 1, source: 'screen' } : undefined;

  const begin = useCallback(async (): Promise<void> => {
    setNote(undefined);
    try {
      await captureRef.current.start();
    } catch (e) {
      setNote(`Voice ID off: ${msg(e)}`);
    }
  }, []);

  const finish = useCallback(async (): Promise<SpeakerHint | undefined> => {
    let clip: Float32Array | null = null;
    try {
      clip = await captureRef.current.stop();
    } catch {
      clip = null;
    }
    const v = voiceRef.current;
    let out: IdentifyOutcome | null = null;
    // Quick MFCC profiles answer before the model loads, so stored enrollments count too.
    if (clip && (v.profiles.length >= 1 || hasEnrolled(householdRef.current))) {
      try {
        out = await v.identifyDetailed(clip);
      } catch {
        out = null;
      }
    }
    if (out?.hint) {
      setRecognized({
        memberName: out.hint.memberName,
        confidence: out.hint.confidence,
        provisional: out.provisional,
        engine: out.engine,
      });
      setNote(undefined);
      return { ...out.hint, source: 'voice-id' };
    }
    setRecognized(undefined);
    if (out?.tooShort) setNote('Too short to recognise');
    else if (out) setNote("Didn't recognise the voice");
    else setNote(undefined);
    return screenHint();
  }, []);

  const speakerForTyped = useCallback((): SpeakerHint | undefined => screenHint(), []);

  return { voice, capture, screenPick, setScreenPick, recognized, begin, finish, speakerForTyped, note };
}
