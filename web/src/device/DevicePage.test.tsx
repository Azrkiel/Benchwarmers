import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantRequest, AssistantResponse, SpeakerHint, UiResourcePayload } from '@shared/types';
import { draftingFixture } from '../lib/fixtures';
import type { IdentifyOutcome, VoiceId } from '../voiceid';
import type { CallToolResultLike, DeviceMcp } from './mcpBrowser';
import type { RecognizerLike } from './speech';
import { DevicePage, DeviceScreen } from './DevicePage';
import type { BridgeLike } from './WidgetHost';
import type { CaptureLike } from './useSpeaker';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

// ---------- fakes ----------

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? 'OK' : 'Not Found', json: async () => body } as unknown as Response;
}

/** Crew lookup -> `code`; party state -> the drafting fixture. Anything else fails loudly. */
function stubFetch(code = 'DEMO') {
  const fn = vi.fn(async (url: string) => {
    if (url.startsWith('/api/crews/')) return json({ code });
    if (url.startsWith('/api/parties/')) return json(draftingFixture);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function response(over: Partial<AssistantResponse> = {}): AssistantResponse {
  return { reply: 'Got it.', toolCalls: [], mode: 'offline', ...over };
}

function fakeSynth() {
  return { speak: vi.fn(), cancel: vi.fn(), speaking: false };
}

function makeRecognizer(): RecognizerLike {
  return {
    lang: '',
    interimResults: false,
    continuous: false,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
}

/** Deliver one recognition result to the hook's onresult handler. */
function say(rec: RecognizerLike, text: string, isFinal = true) {
  const results = [Object.assign([{ transcript: text }], { isFinal })];
  rec.onresult?.({ resultIndex: 0, results });
}

function fakeCapture(): CaptureLike {
  return {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => new Float32Array(16000)),
    recording: false,
    level: 0,
  };
}

const MAYA_OUTCOME: IdentifyOutcome = {
  hint: { memberName: 'Maya', confidence: 0.84, source: 'voice-id' },
  result: null,
  speechSeconds: 2,
  tooShort: false,
  engine: 'wavlm',
  provisional: false,
};

function fakeVoice(): VoiceId {
  return {
    status: 'ready',
    backend: 'wasm',
    modelId: 'm',
    progress: 1,
    profiles: [
      { memberId: 'maya', memberName: 'Maya', samples: [[1]], centroid: [1], backend: 'wasm', modelId: 'm', updatedAt: '' },
    ],
    matchOptions: {},
    setMatchOptions: vi.fn(),
    load: vi.fn(async () => undefined),
    enroll: vi.fn(),
    identify: vi.fn(),
    identifyDetailed: vi.fn(async () => MAYA_OUTCOME),
    clear: vi.fn(),
  } as unknown as VoiceId;
}

function makeMcp(): DeviceMcp {
  return {
    callTool: vi.fn(async (): Promise<CallToolResultLike> => ({ content: [], structuredContent: { view: 'draft' } })),
    readResource: vi.fn(async () => ({
      contents: [{ uri: BOARD_URI, mimeType: 'text/html;profile=mcp-app', text: '<!doctype html><p>board</p>' }],
    })),
    close: vi.fn(async () => undefined),
  };
}

function fakeBridge(connect: () => Promise<void>) {
  return {
    connect: vi.fn(connect),
    sendToolInput: vi.fn(async () => undefined),
    sendToolResult: vi.fn(async () => undefined),
    teardownResource: vi.fn(async () => ({})),
    close: vi.fn(async () => undefined),
  };
}

const BOARD_URI = 'ui://benchwarmers/board.html';

async function waitForParty(code: string) {
  await waitFor(() => expect(screen.getByTestId('party-code').textContent).toBe(code));
}

function typeAndSubmit(text: string) {
  const input = screen.getByLabelText('Type a message');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
}

// ---------- tests ----------

describe('DeviceScreen', () => {
  it('typed turn: request, transcript, trace, mode badge, spoken reply', async () => {
    stubFetch();
    const send = vi.fn(async (_req: AssistantRequest) =>
      response({
        reply: 'Drafted Big Mo to Maya.',
        mode: 'offline',
        toolCalls: [
          {
            name: 'draft_player',
            args: { memberName: 'Maya', player: 'Big Mo' },
            ok: true,
            summary: 'Maya drafted Big Mo',
            ms: 42,
          },
        ],
      }),
    );
    const synth = fakeSynth();
    render(
      <DeviceScreen
        household="garcias"
        deps={{ send, synth, makeUtterance: (text) => ({ text }), recognizerFactory: null }}
      />,
    );
    await waitForParty('DEMO');

    typeAndSubmit("I'm Maya, draft Big Mo");

    await screen.findByText('Drafted Big Mo to Maya.');
    expect(send).toHaveBeenCalledWith({ text: "I'm Maya, draft Big Mo", household: 'garcias', partyCode: 'DEMO' });

    const transcript = screen.getByTestId('transcript');
    expect(within(transcript).getByText("I'm Maya, draft Big Mo")).toBeTruthy();
    expect(screen.getByTestId('mode-badge').textContent).toBe('offline');
    expect((screen.getByLabelText('Type a message') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByLabelText('Show agent trace'));
    expect(screen.getByText('draft_player')).toBeTruthy();
    expect(screen.getByText('Maya drafted Big Mo')).toBeTruthy();
    expect(screen.getByText('42 ms')).toBeTruthy();

    await waitFor(() =>
      expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Drafted Big Mo to Maya.' })),
    );
  });

  it('trace panel shows an empty state before any tool call', async () => {
    stubFetch();
    const send = vi.fn(async () => response({ reply: 'Hello.' }));
    render(<DeviceScreen household="garcias" deps={{ send, synth: fakeSynth(), recognizerFactory: null }} />);
    await waitForParty('DEMO');
    typeAndSubmit('hi');
    await screen.findByText('Hello.');
    fireEvent.click(screen.getByLabelText('Show agent trace'));
    expect(screen.getByText('No tool calls yet')).toBeTruthy();
  });

  it('mode badge renders any mode string the server reports', async () => {
    stubFetch();
    // A newer contract adds modes (e.g. 'gemini'); the badge must not depend on a fixed union.
    const mode = 'gemini' as unknown as AssistantResponse['mode'];
    const send = vi.fn(async () => response({ reply: 'Hi there.', mode }));
    render(<DeviceScreen household="garcias" deps={{ send, synth: fakeSynth(), recognizerFactory: null }} />);
    await waitForParty('DEMO');
    typeAndSubmit('hi');
    await screen.findByText('Hi there.');
    expect(screen.getByTestId('mode-badge').textContent).toBe('gemini');
  });

  it('adopts the party code from the response and sends it next time', async () => {
    stubFetch();
    const send = vi.fn(async (_req: AssistantRequest) => response({ reply: 'Party is up.', partyCode: 'XYZ1' }));
    render(<DeviceScreen household="garcias" deps={{ send, synth: fakeSynth(), recognizerFactory: null }} />);
    await waitForParty('DEMO');

    typeAndSubmit('set up a party');
    await waitForParty('XYZ1');
    await screen.findByText('Party is up.');

    typeAndSubmit('draft someone');
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toMatchObject({ partyCode: 'XYZ1' });
  });

  it('speaker from voice ID: mic starts capture and recognizer, final result sends the hint', async () => {
    stubFetch();
    const rec = makeRecognizer();
    const factory = vi.fn(() => rec);
    const capture = fakeCapture();
    const send = vi.fn(async (_req: AssistantRequest) => response({ reply: 'Okay, Maya.' }));
    render(
      <DeviceScreen
        household="garcias"
        deps={{ send, recognizerFactory: factory, synth: fakeSynth(), voice: fakeVoice(), capture }}
      />,
    );
    await waitForParty('DEMO');

    fireEvent.click(screen.getByRole('button', { name: 'Talk to the assistant' }));
    expect(factory).toHaveBeenCalled();
    expect(rec.start).toHaveBeenCalled();
    await waitFor(() => expect(capture.start).toHaveBeenCalled());

    act(() => {
      say(rec, 'draft Big Mo');
      rec.onend?.();
    });

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const req = send.mock.calls[0][0];
    expect(req.text).toBe('draft Big Mo');
    expect(req.speaker).toEqual({ memberName: 'Maya', confidence: 0.84, source: 'voice-id' } satisfies SpeakerHint);
    expect(screen.getByTestId('recognized-chip').textContent).toContain('Hi Maya');
    await screen.findByText('Okay, Maya.');
  });

  it('speaker from screen picker: chip pick is sent with the typed turn', async () => {
    stubFetch();
    const send = vi.fn(async (_req: AssistantRequest) => response({ reply: 'Leo it is.' }));
    render(<DeviceScreen household="garcias" deps={{ send, synth: fakeSynth(), recognizerFactory: null }} />);
    await waitForParty('DEMO');

    fireEvent.click(screen.getByTestId('member-leo'));
    expect(screen.getByTestId('member-leo').getAttribute('aria-pressed')).toBe('true');
    typeAndSubmit('draft Big Mo');

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toMatchObject({
      speaker: { memberName: 'Leo', confidence: 1, source: 'screen' },
    });
    await screen.findByText('Leo it is.');
  });

  it('error path: failed send shows an inline error and the next send works', async () => {
    stubFetch();
    const send = vi
      .fn<(req: AssistantRequest) => Promise<AssistantResponse>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(response({ reply: 'Back online.' }));
    render(<DeviceScreen household="garcias" deps={{ send, synth: fakeSynth(), recognizerFactory: null }} />);
    await waitForParty('DEMO');

    typeAndSubmit('first');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn't reach the game/);
    expect(alert.textContent).toContain('boom');

    typeAndSubmit('second');
    await screen.findByText('Back online.');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('fallback card renders from structuredContent when the widget cannot start', async () => {
    stubFetch();
    const ui: UiResourcePayload = {
      uri: BOARD_URI,
      toolName: 'draft_player',
      toolInput: { code: 'DEMO' },
      toolResult: { content: [], structuredContent: { view: 'draft', code: 'DEMO', state: draftingFixture } },
    };
    const send = vi.fn(async (_req: AssistantRequest) => response({ reply: 'Board is up.', uiResource: ui }));
    const bridge = fakeBridge(async () => {
      throw new Error('bridge down');
    });
    const createBridge = vi.fn(async () => bridge as unknown as BridgeLike);
    render(
      <DeviceScreen
        household="garcias"
        deps={{ send, synth: fakeSynth(), recognizerFactory: null, mcp: makeMcp(), createBridge }}
      />,
    );
    await waitForParty('DEMO');

    typeAndSubmit('show the board');
    await screen.findByText('Board is up.');

    await waitFor(() => expect(screen.getByTitle('Party board').hasAttribute('hidden')).toBe(true));
    const card = screen.getByRole('region', { name: 'Party board' });
    expect(card.getAttribute('data-view')).toBe('draft');
    expect(within(card).getByText('Draft board')).toBeTruthy();
  });

  it('mounts the widget iframe for a uiResource and pushes the tool result after init', async () => {
    stubFetch();
    const ui: UiResourcePayload = {
      uri: BOARD_URI,
      toolName: 'draft_player',
      toolInput: { code: 'DEMO' },
      toolResult: { content: [], structuredContent: { view: 'draft', code: 'DEMO', state: draftingFixture } },
    };
    const send = vi.fn(async (_req: AssistantRequest) => response({ reply: 'Board is up.', uiResource: ui }));
    const bridge = fakeBridge(async () => undefined);
    const createBridge = vi.fn(async () => bridge as unknown as BridgeLike);
    const mcp = makeMcp();
    render(
      <DeviceScreen
        household="garcias"
        deps={{ send, synth: fakeSynth(), recognizerFactory: null, mcp, createBridge }}
      />,
    );
    await waitForParty('DEMO');

    typeAndSubmit('show the board');
    await screen.findByText('Board is up.');

    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    const frame = screen.getByTitle('Party board');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(mcp.readResource).toHaveBeenCalledWith(BOARD_URI);

    act(() => {
      (bridge as unknown as BridgeLike).oninitialized?.();
    });
    await waitFor(() => expect(bridge.sendToolResult).toHaveBeenCalledWith(ui.toolResult));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Party board' })).toBeNull());
  });

  it('disables the mic and keeps typing when speech is unsupported', async () => {
    stubFetch();
    const send = vi.fn(async (_req: AssistantRequest) => response({ reply: 'Typed works.' }));
    render(<DeviceScreen household="garcias" deps={{ send, synth: fakeSynth(), recognizerFactory: null }} />);
    await waitForParty('DEMO');

    const mic = screen.getByRole('button', { name: 'Talk to the assistant' }) as HTMLButtonElement;
    expect(mic.disabled).toBe(true);
    expect(screen.getByTestId('notice').textContent).toMatch(/Type instead/);

    typeAndSubmit('hello');
    await screen.findByText('Typed works.');
  });
});

describe('DevicePage', () => {
  it('reads the household from the route and renders its name', async () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={['/device/sams-place']}>
        <Routes>
          <Route path="/device/:household" element={<DevicePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('household-name').textContent).toBe("Sam's Place");
    await waitForParty('DEMO');
  });
});

