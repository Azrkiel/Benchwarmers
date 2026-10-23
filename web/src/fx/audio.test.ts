import { describe, expect, it, vi } from 'vitest';
import { SharedAudio } from './audio';

function fakeContext() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const node = () => ({ connect: vi.fn(), gain: { value: 0 }, frequency: { value: 0 }, type: '' });
  const ctx = {
    state: 'suspended', currentTime: 0, sampleRate: 8000, destination: {},
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    createGain: node, createBiquadFilter: node,
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => { const s = { ...node(), buffer: null, onended: null, start: vi.fn(), stop: vi.fn() }; sources.push(s); return s; },
  };
  return { ctx, sources };
}

describe('shared audio', () => {
  it('stays silent until explicitly enabled', async () => {
    const { ctx, sources } = fakeContext();
    const audio = new SharedAudio(() => ctx as never);
    expect(audio.play('swish')).toBe(false);
    await audio.enable();
    expect(ctx.resume).toHaveBeenCalled();
    expect(audio.play('swish')).toBe(true);
    expect(sources[0]!.start).toHaveBeenCalled();
  });

  it('mute and speech stop playback and block new sounds', async () => {
    const { ctx, sources } = fakeContext();
    const audio = new SharedAudio(() => ctx as never);
    await audio.enable();
    audio.play('cheer');
    audio.setSpeaking(true);
    expect(sources[0]!.stop).toHaveBeenCalled();
    expect(audio.play('cheer')).toBe(false);
    audio.setSpeaking(false);
    audio.setMuted(true);
    expect(audio.play('cheer')).toBe(false);
    audio.setMuted(false);
    audio.setVolume(0);
    expect(audio.play('cheer')).toBe(false);
  });

  it('reports unsupported audio without throwing', async () => {
    const audio = new SharedAudio(() => null);
    expect(await audio.enable()).toBe(false);
    expect(audio.snapshot.error).toContain('not supported');
    expect(audio.play('swish')).toBe(false);
  });

  it('a second tab that enables sound takes over playback', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20)); // drain claims from earlier tests
    const a = new SharedAudio(() => fakeContext().ctx as never);
    const b = new SharedAudio(() => fakeContext().ctx as never);
    await a.enable();
    expect(a.snapshot.leader).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await b.enable();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.snapshot.leader).toBe(true);
    expect(a.snapshot.leader).toBe(false);
    a.dispose(); b.dispose();
  });
});
