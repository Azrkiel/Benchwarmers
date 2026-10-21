import type { Backend } from './types';
import { MFCC_MODEL_ID } from './types';
import { centroid, l2normalize } from './match';

export type VoiceProfile = {
  memberId: string;
  memberName: string;
  samples: number[][]; // per-clip L2-normalised embeddings, most recent last, capped at MAX_SAMPLES
  centroid: number[]; // centroid(samples)
  backend: Backend;
  modelId: string;
  updatedAt: string; // ISO
};

export const MAX_SAMPLES = 5;

const VERSION = 1;

export function storageKey(householdId: string): string {
  return `bw.voiceid.${householdId}`;
}

/** Separate key for the small MFCC "quick" profile set used while the main model loads. */
export function quickStorageKey(householdId: string): string {
  return `${storageKey(householdId)}.mfcc`;
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    // some browsers throw SecurityError when touching localStorage
    return undefined;
  }
}

function isFiniteVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function isValidProfile(p: unknown, backend: Backend, modelId: string): p is VoiceProfile {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  if (typeof o.memberId !== 'string' || typeof o.memberName !== 'string') return false;
  if (typeof o.updatedAt !== 'string') return false;
  if (o.backend !== backend || o.modelId !== modelId) return false;
  if (!isFiniteVector(o.centroid)) return false;
  if (!Array.isArray(o.samples) || o.samples.length === 0) return false;
  const dim = o.centroid.length;
  return o.samples.every((s) => isFiniteVector(s) && s.length === dim);
}

export function loadProfiles(
  householdId: string,
  backend: Backend,
  modelId: string,
  storage: Storage | undefined = defaultStorage(),
  key: string = storageKey(householdId),
): VoiceProfile[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const doc = parsed as Record<string, unknown>;
    if (doc.version !== VERSION || !Array.isArray(doc.profiles)) return [];
    // backend/modelId mismatch is dropped here, forcing re-enrollment
    return doc.profiles.filter((p): p is VoiceProfile => isValidProfile(p, backend, modelId));
  } catch {
    return [];
  }
}

export function saveProfiles(
  householdId: string,
  profiles: VoiceProfile[],
  storage: Storage | undefined = defaultStorage(),
  key: string = storageKey(householdId),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: VERSION, profiles }));
    return true;
  } catch {
    return false;
  }
}

export function addSample(
  profiles: VoiceProfile[],
  member: { id: string; name: string },
  embedding: ArrayLike<number>,
  backend: Backend,
  modelId: string,
): VoiceProfile[] {
  const sample = Array.from(l2normalize(embedding));
  const existing = profiles.find((p) => p.memberId === member.id);
  const sameModel = existing !== undefined && existing.backend === backend && existing.modelId === modelId;
  const prior = sameModel ? existing.samples : [];
  const samples = [...prior, sample].slice(-MAX_SAMPLES);
  const profile: VoiceProfile = {
    memberId: member.id,
    memberName: member.name,
    samples,
    centroid: Array.from(centroid(samples)),
    backend,
    modelId,
    updatedAt: new Date().toISOString(),
  };
  if (!existing) return [...profiles, profile];
  return profiles.map((p) => (p.memberId === member.id ? profile : p));
}

export function removeProfile(profiles: VoiceProfile[], memberId?: string): VoiceProfile[] {
  if (memberId === undefined) return [];
  return profiles.filter((p) => p.memberId !== memberId);
}

export function loadQuickProfiles(householdId: string, storage: Storage | undefined = defaultStorage()): VoiceProfile[] {
  return loadProfiles(householdId, 'mfcc', MFCC_MODEL_ID, storage, quickStorageKey(householdId));
}

export function saveQuickProfiles(
  householdId: string,
  profiles: VoiceProfile[],
  storage: Storage | undefined = defaultStorage(),
): boolean {
  return saveProfiles(householdId, profiles, storage, quickStorageKey(householdId));
}

export function addQuickSample(
  profiles: VoiceProfile[],
  member: { id: string; name: string },
  embedding: ArrayLike<number>,
): VoiceProfile[] {
  return addSample(profiles, member, embedding, 'mfcc', MFCC_MODEL_ID);
}
