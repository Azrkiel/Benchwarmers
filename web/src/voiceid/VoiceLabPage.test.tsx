import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@shared/types';
import { ENROLL_SENTENCES, EnrollPanel } from './EnrollPanel';
import type { VoiceId } from './useVoiceId';
import { VoiceLabPage, verdictFor } from './VoiceLabPage';

// No real model: the shared embedder resolves to the MFCC backend immediately.
const { mockEmbedder } = vi.hoisted(() => ({
  mockEmbedder: {
    load: async () => ({ backend: 'mfcc', modelId: 'mfcc-v1' }),
    embed: async () => new Float32Array([1, 0, 0, 0]),
    info: null,
    dispose: () => undefined,
  },
}));

vi.mock('./embedder', () => ({
  getSharedEmbedder: () => mockEmbedder,
}));

afterEach(() => {
  cleanup();
});

function renderLab(path = '/voice-lab') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VoiceLabPage />
    </MemoryRouter>,
  );
}

describe('VoiceLabPage', () => {
  it('shows the privacy note, switches households, and reports the backend after load', async () => {
    renderLab();

    expect(
      screen.getByText('Voice ID audio and voiceprints stay on this device.'),
    ).toBeTruthy();

    // Default household is The Garcias.
    expect(screen.getByRole('heading', { name: 'Maya' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leo' })).toBeTruthy();

    expect(await screen.findByText('MFCC fallback — lower accuracy')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: "Sam's Place" }));

    expect(screen.getByRole('heading', { name: 'Sam' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Priya' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Maya' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Leo' })).toBeNull();
  });

  it('renders threshold and margin sliders', () => {
    renderLab();

    expect(screen.getByRole('slider', { name: 'Threshold' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Margin' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset calibration' })).toBeTruthy();
  });
});

describe('EnrollPanel', () => {
  const members: Member[] = [
    { id: 'maya', name: 'Maya', avatar: 'M' },
    { id: 'leo', name: 'Leo', avatar: 'L' },
  ];

  const fakeVoice = {
    status: 'ready',
    backend: 'mfcc',
    modelId: 'mfcc-v1',
    progress: 1,
    profiles: [],
    matchOptions: { threshold: 0.9, margin: 0.02 },
    setMatchOptions: () => undefined,
    load: async () => undefined,
    enroll: async () => {
      throw new Error('not used');
    },
    identify: async () => null,
    identifyDetailed: async () => ({ hint: null, result: null, speechSeconds: 0, tooShort: true }),
    clear: () => undefined,
  } as unknown as VoiceId;

  it('guides one selected player through one current sample', () => {
    render(<EnrollPanel members={members} voice={fakeVoice} />);

    expect(screen.getByText(ENROLL_SENTENCES[0])).toBeTruthy();
    expect(screen.queryByText(ENROLL_SENTENCES[1])).toBeNull();
    expect(screen.getByRole('button', { name: 'Record sample 1 of 3' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    expect(screen.getByRole('heading', { name: 'Leo' })).toBeTruthy();
  });

  it('confirms profile deletion and does not start a replacement recording', () => {
    const clear=vi.fn();
    render(<EnrollPanel members={members} voice={{ ...fakeVoice, clear, profiles: [{memberId:'maya',samples:[[1],[1],[1]]}] } as unknown as VoiceId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record again' }));
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete and start over' }));
    expect(clear).toHaveBeenCalledWith('maya');
  });
});

describe('verdictFor', () => {
  const ranked = [
    { memberId: 'maya', memberName: 'Maya', score: 0.95 },
    { memberId: 'leo', memberName: 'Leo', score: 0.9 },
  ];

  it('accepts when clear of threshold and margin', () => {
    const v = verdictFor(ranked, { threshold: 0.9, margin: 0.02 });
    expect(v.accepted).toBe(true);
  });

  it('flags a small margin and a below-threshold best score', () => {
    expect(verdictFor(ranked, { threshold: 0.9, margin: 0.1 })).toMatchObject({ accepted: false, reason: 'small-margin' });
    expect(verdictFor(ranked, { threshold: 0.99, margin: 0 })).toMatchObject({ accepted: false, reason: 'below-threshold' });
  });

  it('reports nobody enrolled for empty scores', () => {
    expect(verdictFor([], { threshold: 0.9, margin: 0 })).toMatchObject({ reason: 'nobody-enrolled' });
  });
});
