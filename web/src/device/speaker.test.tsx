import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpeakerHint } from '@shared/types';
import type { IdentifyOutcome, VoiceId } from '../voiceid';
import { FALLBACK_HOUSEHOLDS, householdName, membersFor } from './members';
import { SettingsDrawer } from './SettingsDrawer';
import { SpeakerBar } from './SpeakerBar';
import { useSpeaker, type CaptureLike } from './useSpeaker';

afterEach(cleanup);

const MAYA = { id: 'maya', name: 'Maya', avatar: '🦊' };
const LEO = { id: 'leo', name: 'Leo', avatar: '🦁' };
const clip = new Float32Array(16000);

function outcome(over: Partial<IdentifyOutcome> = {}): IdentifyOutcome {
  const hint: SpeakerHint = { memberName: 'Maya', confidence: 0.84, source: 'voice-id' };
  return { hint, result: null, speechSeconds: 2, tooShort: false, engine: 'wavlm', provisional: false, ...over };
}

function fakeVoice(out: IdentifyOutcome | Error): VoiceId {
  return {
    status: 'ready',
    backend: 'wasm',
    modelId: 'm',
    progress: 1,
    profiles: [{ memberId: 'maya', memberName: 'Maya', samples: [[1]], centroid: [1], backend: 'wasm', modelId: 'm', updatedAt: '' }],
    matchOptions: {},
    setMatchOptions: vi.fn(),
    load: vi.fn(async () => undefined),
    enroll: vi.fn(),
    identify: vi.fn(),
    identifyDetailed: vi.fn(async () => {
      if (out instanceof Error) throw out;
      return out;
    }),
    clear: vi.fn(),
  } as unknown as VoiceId;
}

function fakeCapture(over: Partial<CaptureLike> = {}): CaptureLike {
  return {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => clip),
    recording: false,
    level: 0,
    ...over,
  };
}

const members = [MAYA, LEO];

describe('members', () => {
  const state = {
    households: [
      { id: 'garcias', name: 'Garcia Crew', city: 'x', color: '#fff', members: [{ id: 'z', name: 'Zed', avatar: 'z' }] },
      { id: 'empty', name: 'Empty Co', city: 'x', color: '#fff', members: [] },
    ],
  };
  it('uses state, then fallback, then empty', () => {
    expect(membersFor('garcias', state as never)[0].name).toBe('Zed');
    expect(membersFor('garcias')).toEqual(FALLBACK_HOUSEHOLDS.garcias.members);
    expect(membersFor('empty', state as never)).toEqual([]);
    expect(membersFor('nope')).toEqual([]);
  });
  it('household name', () => {
    expect(householdName('garcias', state as never)).toBe('Garcia Crew');
    expect(householdName('sams-place')).toBe("Sam's Place");
    expect(householdName('unknown')).toBe('unknown');
  });
});

describe('useSpeaker', () => {
  it('confident hint -> voice-id', async () => {
    const voice = fakeVoice(outcome());
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice, capture: fakeCapture() }));
    let hint: SpeakerHint | undefined;
    await act(async () => {
      hint = await result.current.finish();
    });
    expect(hint).toEqual({ memberName: 'Maya', confidence: 0.84, source: 'voice-id' });
    expect(result.current.recognized).toMatchObject({ memberName: 'Maya', provisional: false });
  });

  it('provisional flagged', async () => {
    const voice = fakeVoice(outcome({ provisional: true, engine: 'mfcc-quick' }));
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice, capture: fakeCapture() }));
    await act(async () => {
      await result.current.finish();
    });
    expect(result.current.recognized?.provisional).toBe(true);
  });

  it('no hint falls back to screen pick', async () => {
    const voice = fakeVoice(outcome({ hint: null }));
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice, capture: fakeCapture() }));
    act(() => result.current.setScreenPick('Leo'));
    let hint: SpeakerHint | undefined;
    await act(async () => {
      hint = await result.current.finish();
    });
    expect(hint).toEqual({ memberName: 'Leo', source: 'screen', confidence: 1 });
    expect(result.current.recognized).toBeUndefined();
    expect(result.current.note).toBe("Didn't recognise the voice");
  });

  it('no hint, no pick -> undefined; tooShort note', async () => {
    const voice = fakeVoice(outcome({ hint: null, tooShort: true }));
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice, capture: fakeCapture() }));
    let hint: SpeakerHint | undefined = { memberName: 'x', confidence: 1, source: 'screen' };
    await act(async () => {
      hint = await result.current.finish();
    });
    expect(hint).toBeUndefined();
    expect(result.current.note).toBe('Too short to recognise');
  });

  it('capture.stop rejecting does not throw', async () => {
    const capture = fakeCapture({ stop: vi.fn(async () => { throw new Error('boom'); }) });
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice: fakeVoice(outcome()), capture }));
    act(() => result.current.setScreenPick('Leo'));
    let hint: SpeakerHint | undefined;
    await act(async () => {
      hint = await result.current.finish();
    });
    expect(hint?.source).toBe('screen');
  });

  it('begin failure sets note', async () => {
    const capture = fakeCapture({ start: vi.fn(async () => { throw new Error('denied'); }) });
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice: fakeVoice(outcome()), capture }));
    await act(async () => {
      await result.current.begin();
    });
    expect(result.current.note).toBe('Voice ID off: denied');
  });

  it('speakerForTyped and pick toggle', () => {
    const { result } = renderHook(() => useSpeaker('garcias', members, { voice: fakeVoice(outcome()), capture: fakeCapture() }));
    expect(result.current.speakerForTyped()).toBeUndefined();
    act(() => result.current.setScreenPick('Maya'));
    expect(result.current.speakerForTyped()).toEqual({ memberName: 'Maya', confidence: 1, source: 'screen' });
    act(() => result.current.setScreenPick('Maya'));
    expect(result.current.screenPick).toBeUndefined();
  });
});

describe('SpeakerBar', () => {
  it('renders chips and handles clicks', () => {
    const onPick = vi.fn();
    const { rerender } = render(<SpeakerBar members={members} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('member-leo'));
    expect(onPick).toHaveBeenCalledWith('Leo');
    rerender(<SpeakerBar members={members} screenPick="Leo" onPick={onPick} />);
    expect(screen.getByTestId('member-leo').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('member-leo'));
    expect(onPick).toHaveBeenLastCalledWith(undefined);
  });

  it('recognized chip', () => {
    const { rerender } = render(
      <SpeakerBar members={members} onPick={vi.fn()} recognized={{ memberName: 'Maya', confidence: 0.84, provisional: false }} />,
    );
    const chip = screen.getByTestId('recognized-chip');
    expect(chip.textContent).toContain('Voice matched: Maya');
    expect(chip.textContent).not.toContain('84%');
    expect(chip.textContent).not.toContain('guess');
    rerender(
      <SpeakerBar members={members} onPick={vi.fn()} recognized={{ memberName: 'Maya', confidence: 0.84, provisional: true }} />,
    );
    expect(screen.getByTestId('recognized-chip').textContent).toContain('Choose your name to confirm');
  });
});

describe('SettingsDrawer', () => {
  const base = { members, voice: fakeVoice(outcome()), muted: false, partyCode: 'ABCD', householdName: 'The Garcias' };

  it('keeps focus in place when parent data and callbacks refresh', () => {
    const view=render(<SettingsDrawer {...base} open onClose={()=>undefined} onToggleMute={vi.fn()} />);
    const speech=screen.getByLabelText('Speak replies');speech.focus();
    view.rerender(<SettingsDrawer {...base} partyCode="NEXT" open onClose={()=>undefined} onToggleMute={vi.fn()} />);
    expect(document.activeElement).toBe(speech);
  });

  it('renders nothing when closed', () => {
    const { container } = render(<SettingsDrawer {...base} open={false} onClose={vi.fn()} onToggleMute={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows enroll panel, closes, toggles mute', () => {
    const onClose = vi.fn();
    const onToggleMute = vi.fn();
    render(<SettingsDrawer {...base} open onClose={onClose} onToggleMute={onToggleMute} />);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByText(/Maya/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Leo/).length).toBeGreaterThan(0);
    expect(screen.getByText('ABCD')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Speak replies'));
    expect(onToggleMute).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Close settings'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('idle shows load button, no auto-load', () => {
    const voice = { ...fakeVoice(outcome()), status: 'idle' as const };
    render(<SettingsDrawer {...base} voice={voice} open onClose={vi.fn()} onToggleMute={vi.fn()} />);
    expect(voice.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Prepare voice recognition'));
    expect(voice.load).toHaveBeenCalled();
  });
});
