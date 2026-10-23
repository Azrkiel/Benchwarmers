import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantRequest, AssistantResponse } from '@shared/types';
import { draftingFixture } from '../lib/fixtures';
import type { RecognizerLike } from '../device/speech';
import type { DeviceDeps } from '../device/DevicePage';
import { DisplayScreen, fitBox } from './DisplayPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* ignore */ }
});

function json(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as unknown as Response;
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/crews/')) return json({ code: 'DEMO' });
    if (url.startsWith('/api/parties/')) return json(draftingFixture);
    throw new Error(`unexpected fetch ${url}`);
  }));
}

const synth = () => ({ speak: vi.fn(), cancel: vi.fn(), speaking: false });

function renderAt(url: string, deps: DeviceDeps) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DisplayScreen household="garcias" deps={{ synth: synth(), recognizerFactory: null, ...deps }} />
    </MemoryRouter>,
  );
}

function makeRecognizer(): RecognizerLike {
  return {
    lang: '', interimResults: false, continuous: false,
    onresult: null, onerror: null, onend: null,
    start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
  };
}

const ok = (over: Partial<AssistantResponse> = {}): AssistantResponse => ({ reply: 'Got it.', toolCalls: [], mode: 'offline', ...over });

describe('DisplayScreen', () => {
  it('renders idle with clock, hint and outside chrome', () => {
    stubFetch();
    renderAt('/display/garcias', {});
    expect(screen.getByTestId('display-idle')).toBeTruthy();
    expect(screen.getByText(/Who.s winning\?/, { selector: '.sd-hint' })).toBeTruthy();
    expect(screen.getByText('Simulated smart display')).toBeTruthy();
    expect(screen.getByTestId('display-screen').style.width).toBe('1280px');
    expect(screen.getByLabelText('Type a request')).toBeTruthy();
  });

  it('toggles screen size', () => {
    stubFetch();
    renderAt('/display/garcias', {});
    const large = screen.getByRole('button', { name: /Large 1920x1080/ });
    fireEvent.click(large);
    expect(screen.getByTestId('display-screen').style.width).toBe('1920px');
    expect(screen.getByTestId('display-screen').style.height).toBe('1080px');
    fireEvent.click(screen.getByRole('button', { name: /Small 1280x800/ }));
    expect(screen.getByTestId('display-screen').style.width).toBe('1280px');
  });

  it('offers a compact 960x480 preset labeled as a Show 5 target simulation', () => {
    renderAt('/display/garcias?size=compact', {});
    expect(screen.getByRole('button', { name: /Compact 960x480 \(Show 5 target\)/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('display-screen').style.width).toBe('960px');
    expect(screen.getByText('Simulated smart display')).toBeTruthy();
  });

  it('honours ?size=large and ?clean=1 (no outside chrome)', () => {
    stubFetch();
    renderAt('/display/garcias?size=large&clean=1', {});
    expect(screen.getByTestId('display-screen').style.width).toBe('1920px');
    expect(screen.queryByText('Simulated smart display')).toBeNull();
    expect(screen.queryByLabelText('Type a request')).toBeNull();
  });

  it('typed prompt shows caption and spoken reply', async () => {
    stubFetch();
    const send = vi.fn(async (_r: AssistantRequest) => ok({ reply: 'Harbor leads by 4.' }));
    const s = synth();
    renderAt('/display/garcias', { send, synth: s, makeUtterance: (text) => ({ text }) });
    const input = screen.getByLabelText('Type a request');
    fireEvent.change(input, { target: { value: "Who's winning?" } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Harbor leads by 4.');
    expect(screen.getByTestId('display-caption').textContent).toContain("Who's winning?");
    expect(send.mock.calls[0][0]).toMatchObject({ text: "Who's winning?", household: 'garcias' });
    expect(screen.queryByTestId('display-idle')).toBeNull();
    await waitFor(() => expect(s.speak).toHaveBeenCalled());
  });

  it('quick-prompt chip sends the name-bearing utterance', async () => {
    stubFetch();
    const send = vi.fn(async (_r: AssistantRequest) => ok({ reply: 'Drafted Big Mo to Maya.' }));
    renderAt('/display/garcias', { send });
    fireEvent.click(screen.getByRole('button', { name: 'Draft Big Mo for Maya' }));
    await screen.findByText('Drafted Big Mo to Maya.');
    expect(send.mock.calls[0][0].text).toBe("I'm Maya, draft Big Mo");
  });

  it('Space starts listening, release stops, light bar toggles', () => {
    stubFetch();
    const rec = makeRecognizer();
    renderAt('/display/garcias', {
      recognizerFactory: () => rec,
      capture: { start: vi.fn(async () => undefined), stop: vi.fn(async () => null), recording: false, level: 0 },
    });
    const bar = screen.getByTestId('display-lightbar');
    expect(bar.getAttribute('data-active')).toBe('false');
    act(() => { fireEvent.keyDown(window, { code: 'Space' }); });
    expect(rec.start).toHaveBeenCalled();
    expect(bar.getAttribute('data-active')).toBe('true');
    act(() => { fireEvent.keyUp(window, { code: 'Space' }); });
    expect(rec.stop).toHaveBeenCalled();
  });

  it('keeps listening through final phrases while Space is held and sends once on release', async () => {
    stubFetch();
    const rec = makeRecognizer();
    // Model the browser's single-utterance auto-end, which must be disabled for holding Space.
    const emitPhrase = () => {
      rec.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "Who's winning?" }], { isFinal: true })] });
      if (!rec.continuous) rec.onend?.();
    };
    vi.mocked(rec.stop).mockImplementation(() => rec.onend?.());
    const send = vi.fn(async (_r: AssistantRequest) => ok());
    renderAt('/display/garcias', {
      send, recognizerFactory: () => rec,
      capture: { start: vi.fn(async () => undefined), stop: vi.fn(async () => null), recording: false, level: 0 },
    });
    fireEvent.keyDown(window, { code: 'Space' });
    act(emitPhrase);
    expect(screen.getByTestId('display-lightbar').getAttribute('data-active')).toBe('true');
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: 'Space', repeat: true });
    expect(rec.start).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { code: 'Space' });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toMatchObject({ text: "Who's winning?" });
    expect(screen.getByTestId('display-lightbar').getAttribute('data-active')).toBe('false');
  });

  it('stops a held-Space recording when the window loses focus', () => {
    stubFetch();
    const rec = makeRecognizer();
    renderAt('/display/garcias', {
      recognizerFactory: () => rec,
      capture: { start: vi.fn(async () => undefined), stop: vi.fn(async () => null), recording: false, level: 0 },
    });
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.blur(window);
    expect(rec.stop).toHaveBeenCalledTimes(1);
  });

  it('stops on a quick press/release even before listening has rerendered', () => {
    stubFetch();
    const rec = makeRecognizer();
    renderAt('/display/garcias', {
      recognizerFactory: () => rec,
      capture: { start: vi.fn(async () => undefined), stop: vi.fn(async () => null), recording: false, level: 0 },
    });
    act(() => {
      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.keyUp(window, { code: 'Space' });
    });
    expect(rec.stop).toHaveBeenCalledTimes(1);
  });

  it('shows speech errors on the screen even in clean mode', () => {
    stubFetch();
    const rec = makeRecognizer();
    renderAt('/display/garcias?clean=1', {
      recognizerFactory: () => rec,
      capture: { start: vi.fn(async () => undefined), stop: vi.fn(async () => null), recording: false, level: 0 },
    });
    fireEvent.keyDown(window, { code: 'Space' });
    act(() => { rec.onerror?.({ error: 'not-allowed' }); rec.onend?.(); });
    expect(screen.getByRole('alert').textContent).toContain('Microphone blocked');
    expect(screen.getByTestId('display-screen').contains(screen.getByRole('alert'))).toBe(true);
  });

  it('fitBox letterboxes', () => {
    const f = fitBox(1536, 754, 1336, 856);
    expect(f.scale).toBeCloseTo(754 / 856, 5);
    expect(f.x).toBeGreaterThan(0);
  });

  it('replaces a failed widget in its existing layout slot', async () => {
    stubFetch();
    const send = vi.fn(async () => ok({
      reply: 'Maya leads.',
      partyCode: 'DEMO',
      uiResource: {
        uri: 'ui://benchwarmers/board.html',
        toolName: 'get_leaderboard',
        toolInput: { code: 'DEMO' },
        toolResult: { content: [], structuredContent: { view: 'tonight', code: 'DEMO' } },
      },
    }));
    const { container } = renderAt('/display/garcias', {
      send,
      mcp: {
        callTool: vi.fn(async () => ({ content: [] })),
        readResource: vi.fn(async () => { throw new Error('MCP unavailable'); }),
        close: vi.fn(async () => undefined),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: "Who's winning?" }));
    await screen.findByText(/Read-only board/);
    expect(container.querySelectorAll('.sd-widget')).toHaveLength(1);
    expect(container.querySelector('.sd-widget .sd-fallback')).toBeTruthy();
  });
});
