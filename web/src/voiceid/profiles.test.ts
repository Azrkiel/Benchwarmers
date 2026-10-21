import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addQuickSample,
  addSample,
  loadProfiles,
  loadQuickProfiles,
  MAX_SAMPLES,
  quickStorageKey,
  removeProfile,
  saveProfiles,
  saveQuickProfiles,
  storageKey,
} from './profiles';
import type { VoiceProfile } from './profiles';

const WAVLM = 'Xenova/wavlm-base-plus-sv';
const MFCC = 'mfcc-v1';
const HH = 'garcias';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  key(i: number) {
    return Array.from(this.data.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
}

const throwingStorage = (opts: { get?: boolean; set?: boolean }): Storage => {
  const boom = () => {
    throw new DOMException('denied', 'SecurityError');
  };
  return {
    length: 0,
    clear: () => {},
    key: () => null,
    removeItem: () => {},
    getItem: opts.get ? boom : () => null,
    setItem: opts.set ? boom : () => {},
  } as Storage;
};

const norm = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));

function profile(id: string, backend: 'wavlm' | 'mfcc', modelId: string, dim = 3): VoiceProfile {
  const v = Array.from({ length: dim }, (_, i) => i + 1);
  return {
    memberId: id,
    memberName: id.toUpperCase(),
    samples: [v],
    centroid: v,
    backend,
    modelId,
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

describe('storageKey', () => {
  it('formats the household key', () => {
    expect(storageKey('garcias')).toBe('bw.voiceid.garcias');
    expect(storageKey('sams-place')).toBe('bw.voiceid.sams-place');
  });
});

describe('save/load round trip', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('round-trips through jsdom localStorage', () => {
    let profiles: VoiceProfile[] = [];
    profiles = addSample(profiles, { id: 'maya', name: 'Maya' }, [3, 4, 0], 'mfcc', MFCC);
    profiles = addSample(profiles, { id: 'maya', name: 'Maya' }, [0, 1, 1], 'mfcc', MFCC);
    expect(saveProfiles(HH, profiles)).toBe(true);
    const loaded = loadProfiles(HH, 'mfcc', MFCC);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].memberId).toBe('maya');
    expect(loaded[0].samples).toHaveLength(2);
    loaded[0].samples.forEach((s, i) => s.forEach((x, j) => expect(x).toBeCloseTo(profiles[0].samples[i][j], 6)));
    loaded[0].centroid.forEach((x, j) => expect(x).toBeCloseTo(profiles[0].centroid[j], 6));
    expect(loaded[0].updatedAt).toBe(profiles[0].updatedAt);
  });

  it('round-trips through an in-memory Storage stub', () => {
    const store = new MemoryStorage();
    const profiles = [profile('maya', 'wavlm', WAVLM)];
    expect(saveProfiles(HH, profiles, store)).toBe(true);
    expect(JSON.parse(store.getItem(storageKey(HH)) as string)).toEqual({ version: 1, profiles });
    const loaded = loadProfiles(HH, 'wavlm', WAVLM, store);
    expect(loaded).toEqual(profiles);
  });

  it('returns [] and false when globalThis.localStorage is undefined', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(loadProfiles(HH, 'mfcc', MFCC)).toEqual([]);
      expect(saveProfiles(HH, [profile('maya', 'mfcc', MFCC)])).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns [] and false when accessing globalThis.localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      let loaded: VoiceProfile[] | undefined;
      let saved: boolean | undefined;
      expect(() => {
        loaded = loadProfiles(HH, 'mfcc', MFCC);
        saved = saveProfiles(HH, [profile('maya', 'mfcc', MFCC)]);
      }).not.toThrow();
      expect(loaded).toEqual([]);
      expect(saved).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      localStorage.clear();
    }
  });
});

describe('model invalidation', () => {
  it('drops profiles saved with a different backend', () => {
    const store = new MemoryStorage();
    saveProfiles(HH, [profile('maya', 'mfcc', MFCC)], store);
    expect(loadProfiles(HH, 'wavlm', WAVLM, store)).toEqual([]);
  });

  it('drops profiles saved with a different modelId', () => {
    const store = new MemoryStorage();
    saveProfiles(HH, [profile('maya', 'wavlm', 'Xenova/old')], store);
    expect(loadProfiles(HH, 'wavlm', WAVLM, store)).toEqual([]);
  });

  it('keeps matching profiles while dropping mismatched ones in the same household', () => {
    const store = new MemoryStorage();
    saveProfiles(HH, [profile('maya', 'mfcc', MFCC), profile('leo', 'wavlm', WAVLM)], store);
    const loaded = loadProfiles(HH, 'wavlm', WAVLM, store);
    expect(loaded.map((p) => p.memberId)).toEqual(['leo']);
  });
});

describe('storage errors', () => {
  it('getItem throwing -> load returns []', () => {
    expect(() => loadProfiles(HH, 'mfcc', MFCC, throwingStorage({ get: true }))).not.toThrow();
    expect(loadProfiles(HH, 'mfcc', MFCC, throwingStorage({ get: true }))).toEqual([]);
  });

  it('setItem throwing -> save returns false without throwing', () => {
    let result: boolean | undefined;
    expect(() => {
      result = saveProfiles(HH, [profile('maya', 'mfcc', MFCC)], throwingStorage({ set: true }));
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it('corrupt JSON -> []', () => {
    const store = new MemoryStorage();
    store.setItem(storageKey(HH), '{not json');
    expect(loadProfiles(HH, 'mfcc', MFCC, store)).toEqual([]);
  });

  it('wrong version or shape -> []', () => {
    const store = new MemoryStorage();
    store.setItem(storageKey(HH), JSON.stringify({ version: 2, profiles: [profile('maya', 'mfcc', MFCC)] }));
    expect(loadProfiles(HH, 'mfcc', MFCC, store)).toEqual([]);
    store.setItem(storageKey(HH), JSON.stringify(null));
    expect(loadProfiles(HH, 'mfcc', MFCC, store)).toEqual([]);
    store.setItem(storageKey(HH), JSON.stringify({ version: 1, profiles: 'nope' }));
    expect(loadProfiles(HH, 'mfcc', MFCC, store)).toEqual([]);
  });

  it('missing key -> []', () => {
    expect(loadProfiles(HH, 'mfcc', MFCC, new MemoryStorage())).toEqual([]);
  });
});

describe('invalid entries are dropped', () => {
  it('drops entries with missing fields, bad arrays, empty samples or centroid mismatch', () => {
    const good = profile('good', 'mfcc', MFCC);
    const { memberName: _n, ...noName } = profile('noname', 'mfcc', MFCC);
    const bad = [
      noName,
      { ...profile('strs', 'mfcc', MFCC), samples: [[1, 'x', 3]] },
      { ...profile('nan', 'mfcc', MFCC), centroid: [1, null, 3] },
      { ...profile('empty', 'mfcc', MFCC), samples: [] },
      { ...profile('dim', 'mfcc', MFCC), centroid: [1, 2] },
      { ...profile('mixdim', 'mfcc', MFCC), samples: [[1, 2, 3], [1, 2]] },
      null,
      42,
    ];
    const store = new MemoryStorage();
    store.setItem(storageKey(HH), JSON.stringify({ version: 1, profiles: [...bad, good] }));
    const loaded = loadProfiles(HH, 'mfcc', MFCC, store);
    expect(loaded.map((p) => p.memberId)).toEqual(['good']);
  });
});

describe('addSample', () => {
  const member = { id: 'maya', name: 'Maya' };

  it('creates a profile for a new member', () => {
    const out = addSample([], member, [3, 4], 'mfcc', MFCC);
    expect(out).toHaveLength(1);
    expect(out[0].memberId).toBe('maya');
    expect(out[0].memberName).toBe('Maya');
    expect(out[0].backend).toBe('mfcc');
    expect(out[0].modelId).toBe(MFCC);
    expect(out[0].samples).toHaveLength(1);
    expect(out[0].samples[0][0]).toBeCloseTo(0.6, 6);
    expect(out[0].samples[0][1]).toBeCloseTo(0.8, 6);
    expect(Array.isArray(out[0].samples[0])).toBe(true);
    expect(Array.isArray(out[0].centroid)).toBe(true);
    expect(() => new Date(out[0].updatedAt).toISOString()).not.toThrow();
  });

  it('appends samples and updates the existing profile', () => {
    let p = addSample([], member, [1, 0], 'mfcc', MFCC);
    p = addSample(p, { id: 'maya', name: 'Maya K' }, [0, 1], 'mfcc', MFCC);
    expect(p).toHaveLength(1);
    expect(p[0].samples).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(p[0].memberName).toBe('Maya K');
  });

  it('keeps only the last MAX_SAMPLES samples', () => {
    expect(MAX_SAMPLES).toBe(5);
    let p: VoiceProfile[] = [];
    for (let i = 1; i <= 7; i++) p = addSample(p, member, [i, 1, 0], 'mfcc', MFCC);
    expect(p[0].samples).toHaveLength(5);
    // most recent last: samples for i = 3..7
    const firsts = p[0].samples.map((s) => s[0] / norm(s));
    const expected = [3, 4, 5, 6, 7].map((i) => i / norm([i, 1, 0]));
    firsts.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 6));
  });

  it('resets samples when backend or modelId changes', () => {
    let p = addSample([], member, [1, 0], 'mfcc', MFCC);
    p = addSample(p, member, [0, 1], 'mfcc', MFCC);
    p = addSample(p, member, [1, 1], 'wavlm', WAVLM);
    expect(p[0].backend).toBe('wavlm');
    expect(p[0].modelId).toBe(WAVLM);
    expect(p[0].samples).toHaveLength(1);
    p = addSample(p, member, [1, 0], 'wavlm', 'Xenova/other');
    expect(p[0].samples).toHaveLength(1);
    expect(p[0].modelId).toBe('Xenova/other');
  });

  it('does not mutate inputs', () => {
    const before = addSample([], member, [1, 0], 'mfcc', MFCC);
    const snapshot = JSON.parse(JSON.stringify(before));
    const out = addSample(before, member, [0, 1], 'mfcc', MFCC);
    expect(before).toEqual(snapshot);
    expect(out).not.toBe(before);
    expect(out[0]).not.toBe(before[0]);
    const arr: VoiceProfile[] = [];
    addSample(arr, member, [1, 0], 'mfcc', MFCC);
    expect(arr).toHaveLength(0);
  });

  it('centroid has unit norm', () => {
    let p = addSample([], member, [1, 2, 3], 'mfcc', MFCC);
    p = addSample(p, member, [-2, 0.5, 1], 'mfcc', MFCC);
    p = addSample(p, member, [0.1, 4, -1], 'mfcc', MFCC);
    expect(norm(p[0].centroid)).toBeCloseTo(1, 6);
  });

  it('zero embedding does not produce NaN', () => {
    const p = addSample([], member, [0, 0, 0], 'mfcc', MFCC);
    expect(p[0].centroid.every((x) => Number.isFinite(x))).toBe(true);
    expect(p[0].samples[0].every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('removeProfile', () => {
  const ps = [profile('maya', 'mfcc', MFCC), profile('leo', 'mfcc', MFCC)];

  it('removes one member', () => {
    expect(removeProfile(ps, 'maya').map((p) => p.memberId)).toEqual(['leo']);
  });

  it('removes all when memberId is undefined', () => {
    expect(removeProfile(ps)).toEqual([]);
    expect(ps).toHaveLength(2);
  });
});

describe('household isolation', () => {
  it('stores each household under its own key', () => {
    const store = new MemoryStorage();
    saveProfiles('garcias', [profile('maya', 'mfcc', MFCC)], store);
    saveProfiles('sams-place', [profile('sam', 'mfcc', MFCC)], store);
    expect(loadProfiles('garcias', 'mfcc', MFCC, store).map((p) => p.memberId)).toEqual(['maya']);
    expect(loadProfiles('sams-place', 'mfcc', MFCC, store).map((p) => p.memberId)).toEqual(['sam']);
    expect(loadProfiles('unknown', 'mfcc', MFCC, store)).toEqual([]);
  });

  it('stores quick MFCC profiles under a separate key without touching the main profiles', () => {
    const store = new MemoryStorage();
    saveProfiles(HH, [profile('maya', 'wavlm', WAVLM)], store);
    const quick = addQuickSample([], { id: 'maya', name: 'Maya' }, [1, 2, 3]);
    expect(quickStorageKey(HH)).toBe(`${storageKey(HH)}.mfcc`);
    expect(saveQuickProfiles(HH, quick, store)).toBe(true);
    expect(store.getItem(quickStorageKey(HH))).not.toBeNull();
    expect(loadQuickProfiles(HH, store).map((p) => [p.memberId, p.backend, p.modelId])).toEqual([['maya', 'mfcc', MFCC]]);
    expect(loadProfiles(HH, 'wavlm', WAVLM, store).map((p) => p.memberId)).toEqual(['maya']);
    expect(loadProfiles(HH, 'mfcc', MFCC, store)).toEqual([]);
  });

  it('returns no quick profiles when the quick key is absent or corrupt', () => {
    const store = new MemoryStorage();
    expect(loadQuickProfiles(HH, store)).toEqual([]);
    store.setItem(quickStorageKey(HH), '{nope');
    expect(loadQuickProfiles(HH, store)).toEqual([]);
  });
});
