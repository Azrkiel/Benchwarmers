import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeakerHint } from '@shared/types';
import { speechSeconds } from './audio';
import { getSharedEmbedder, type Embedder, type LoadInfo } from './embedder';
import { DEFAULT_MATCH, identify as matchIdentify, toSpeakerHint, type Candidate, type MatchOptions, type MatchResult } from './match';
import { addSample, loadProfiles, removeProfile, saveProfiles, type VoiceProfile } from './profiles';
import { MIN_SPEECH_SECONDS, type Backend } from './types';

export type VoiceIdStatus = 'idle' | 'loading' | 'ready' | 'error';

export type IdentifyOutcome = {
  hint: SpeakerHint | null;
  result: MatchResult | null;
  speechSeconds: number;
  tooShort: boolean;
};

export type VoiceIdOptions = {
  embedder?: Embedder;
  storage?: Storage;
  autoLoad?: boolean; // default true
  forceFallback?: boolean;
};

export type VoiceId = {
  status: VoiceIdStatus;
  backend: Backend | null;
  modelId: string | null;
  fallbackReason?: string;
  progress: number; // 0..1
  error?: string;
  profiles: VoiceProfile[];
  matchOptions: MatchOptions;
  setMatchOptions(o: MatchOptions): void;
  load(): Promise<void>;
  enroll(member: { id: string; name: string }, clip: Float32Array): Promise<VoiceProfile>;
  identify(clip: Float32Array): Promise<SpeakerHint | null>;
  identifyDetailed(clip: Float32Array): Promise<IdentifyOutcome>;
  clear(memberId?: string): void;
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Speaker identification for one household. Loads the embedder, keeps enrolled
 * profiles in sync with storage, and matches clips to enrolled members.
 */
export function useVoiceId(householdId: string, opts: VoiceIdOptions = {}): VoiceId {
  const [status, setStatus] = useState<VoiceIdStatus>('idle');
  const [info, setInfo] = useState<LoadInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [profiles, setProfilesState] = useState<VoiceProfile[]>([]);
  const [matchOptions, setMatchState] = useState<MatchOptions>(DEFAULT_MATCH.wavlm);

  // Refs hold the latest values so async work never reads stale closures.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const householdRef = useRef(householdId);
  householdRef.current = householdId;
  const aliveRef = useRef(false);
  const embedderRef = useRef<Embedder | null>(null);
  const infoRef = useRef<LoadInfo | null>(null);
  const profilesRef = useRef<VoiceProfile[]>([]);
  const matchRef = useRef<MatchOptions>(DEFAULT_MATCH.wavlm);
  const inflightRef = useRef<Promise<LoadInfo> | null>(null);

  const getEmbedder = (): Embedder => {
    if (!embedderRef.current) {
      const o = optsRef.current;
      embedderRef.current = o.embedder ?? getSharedEmbedder({ forceFallback: o.forceFallback });
    }
    return embedderRef.current;
  };

  const setProfiles = (next: VoiceProfile[]): void => {
    profilesRef.current = next;
    setProfilesState(next);
  };

  // Every profile change goes through here: state + storage.
  const commit = (next: VoiceProfile[]): void => {
    setProfiles(next);
    saveProfiles(householdRef.current, next, optsRef.current.storage);
  };

  const reloadProfiles = (hid: string, i: LoadInfo): void => {
    setProfiles(loadProfiles(hid, i.backend, i.modelId, optsRef.current.storage));
  };

  const load = useCallback((): Promise<LoadInfo> => {
    if (inflightRef.current) return inflightRef.current;
    const p = (async (): Promise<LoadInfo> => {
      if (aliveRef.current) {
        setStatus('loading');
        setError(undefined);
      }
      try {
        const next = await getEmbedder().load((v) => {
          if (aliveRef.current) setProgress(v);
        });
        const prev = infoRef.current;
        infoRef.current = next;
        // Reset to backend defaults only when the backend changes; user tweaks survive reloads.
        if (!prev || prev.backend !== next.backend) {
          matchRef.current = DEFAULT_MATCH[next.backend];
        }
        if (aliveRef.current) {
          setInfo(next);
          setMatchState(matchRef.current);
        }
        reloadProfiles(householdRef.current, next);
        if (aliveRef.current) {
          setProgress(1);
          setStatus('ready');
        }
        return next;
      } catch (e) {
        if (aliveRef.current) {
          setStatus('error');
          setError(messageOf(e));
        }
        throw e;
      } finally {
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, []);

  const ensureLoaded = async (): Promise<LoadInfo> => infoRef.current ?? load();

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Runs on mount and whenever householdId changes.
  useEffect(() => {
    const i = infoRef.current;
    setProfiles([]);
    if (i) {
      reloadProfiles(householdId, i);
    } else if (optsRef.current.autoLoad ?? true) {
      load().catch(() => undefined); // error is already in state
    }
    // load is stable; householdId is the only trigger.
  }, [householdId]);

  const setMatchOptions = (o: MatchOptions): void => {
    matchRef.current = o;
    setMatchState(o);
  };

  const enroll = async (member: { id: string; name: string }, clip: Float32Array): Promise<VoiceProfile> => {
    if (speechSeconds(clip) < MIN_SPEECH_SECONDS) throw new Error('clip too short');
    const hid = householdRef.current;
    const i = await ensureLoaded();
    const embedding = await getEmbedder().embed(clip);
    if (householdRef.current !== hid) throw new Error('household changed during enrollment');
    // Read the latest profiles here (not a captured snapshot) so concurrent enrolls both land.
    const next = addSample(profilesRef.current, member, embedding, i.backend, i.modelId);
    commit(next);
    return next.find((p) => p.memberId === member.id)!;
  };

  const identifyDetailed = async (clip: Float32Array): Promise<IdentifyOutcome> => {
    const sec = speechSeconds(clip);
    if (sec < MIN_SPEECH_SECONDS) return { hint: null, result: null, speechSeconds: sec, tooShort: true };
    const candidates: Candidate[] = profilesRef.current.map((p) => ({
      memberId: p.memberId,
      memberName: p.memberName,
      centroid: p.centroid,
    }));
    if (candidates.length === 0) return { hint: null, result: null, speechSeconds: sec, tooShort: false };
    const embedding = await getEmbedder().embed(clip);
    const result = matchIdentify(embedding, candidates, matchRef.current);
    return { hint: toSpeakerHint(result), result, speechSeconds: sec, tooShort: false };
  };

  const identify = async (clip: Float32Array): Promise<SpeakerHint | null> =>
    (await identifyDetailed(clip)).hint;

  const clear = (memberId?: string): void => {
    // Before load the household's stored profiles are not in memory; saving now would wipe them.
    if (!infoRef.current) return;
    commit(removeProfile(profilesRef.current, memberId));
  };

  return {
    status,
    backend: info?.backend ?? null,
    modelId: info?.modelId ?? null,
    fallbackReason: info?.fallbackReason,
    progress,
    error,
    profiles,
    matchOptions,
    setMatchOptions,
    load: async () => {
      await load();
    },
    enroll,
    identify,
    identifyDetailed,
    clear,
  };
}
