import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { AssistantRequest, AssistantResponse, UiResourcePayload } from '@shared/types';
import { useDeviceAssistant } from './useDeviceAssistant';

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: 'err', json: async () => body } as unknown as Response;
}

function reply(over: Partial<AssistantResponse> = {}): AssistantResponse {
  return { reply: 'Got it.', toolCalls: [], mode: 'gemini', ...over };
}

/** Routes GET crew lookups to `code` (or 404 when null) and POST /api/assistant to `post`. */
function stubFetch(post: (init?: RequestInit) => Promise<Response> | Response, code: string | null = 'DEMO') {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/crews/')) return code === null ? json({}, false, 404) : json({ code });
    if (url === '/api/assistant') return post(init);
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function postBodies(fn: ReturnType<typeof stubFetch>): AssistantRequest[] {
  return fn.mock.calls
    .filter(([url]) => url === '/api/assistant')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as AssistantRequest);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useDeviceAssistant with global fetch', () => {
  it('POSTs a typed turn with the resolved party code and records the transcript', async () => {
    const f = stubFetch(
      () =>
        json(
          reply({
            reply: 'Pick is in.',
            toolCalls: [{ name: 'make_pick', args: {}, ok: true, summary: 'ok', ms: 5 }],
            mode: 'offline',
          }),
        ),
      'DEMO',
    );
    const { result } = renderHook(() => useDeviceAssistant('garcias'));
    await waitFor(() => expect(result.current.partyCode).toBe('DEMO'));

    await act(async () => {
      await result.current.send('  pick Maya  ');
    });

    const [body] = postBodies(f);
    expect(body).toEqual({ text: 'pick Maya', household: 'garcias', partyCode: 'DEMO' });
    expect(f.mock.calls.find(([u]) => u === '/api/assistant')?.[1]).toMatchObject({ method: 'POST' });
    expect(result.current.turns.map((t) => [t.role, t.text])).toEqual([
      ['user', 'pick Maya'],
      ['assistant', 'Pick is in.'],
    ]);
    expect(result.current.turns[1]!.toolCalls).toHaveLength(1);
    expect(result.current.turns[1]!.mode).toBe('offline');
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('adopts the party code from a response and sends history on the next request', async () => {
    let n = 0;
    const f = stubFetch(() => {
      n += 1;
      return json(n === 1 ? reply({ reply: 'Watch party set up.', partyCode: 'ABCD' }) : reply({ reply: 'Second.' }));
    }, 'DEMO');
    const { result } = renderHook(() => useDeviceAssistant('garcias'));
    await waitFor(() => expect(result.current.partyCode).toBe('DEMO'));

    await act(async () => {
      await result.current.send('set up a party');
    });
    expect(result.current.partyCode).toBe('ABCD');
    expect(result.current.lastResponse?.reply).toBe('Watch party set up.');

    await act(async () => {
      await result.current.send('who is winning?');
    });

    const [first, second] = postBodies(f);
    expect(first).toEqual({ text: 'set up a party', household: 'garcias', partyCode: 'DEMO' });
    expect(second).toEqual({
      text: 'who is winning?',
      household: 'garcias',
      partyCode: 'ABCD',
      history: [
        { role: 'user', text: 'set up a party' },
        { role: 'assistant', text: 'Watch party set up.' },
      ],
    });
    expect(result.current.turns).toHaveLength(4);
  });

  it('turns a 500 JSON error into error state and an error turn, and stays usable', async () => {
    let n = 0;
    stubFetch(() => {
      n += 1;
      return n === 1 ? json({ error: 'Something went wrong.' }, false, 500) : json(reply({ reply: 'Back.' }));
    });
    const { result } = renderHook(() => useDeviceAssistant('garcias'));

    let first: AssistantResponse | undefined = reply();
    await act(async () => {
      first = await result.current.send('hello');
    });
    expect(first).toBeUndefined();
    expect(result.current.error).toBe('Something went wrong.');
    expect(result.current.turns[1]).toMatchObject({ role: 'assistant', error: true });
    expect(result.current.turns[1]!.text).toBe("Sorry, I couldn't reach the game. Something went wrong.");
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await result.current.send('again');
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.turns.at(-1)).toMatchObject({ role: 'assistant', text: 'Back.' });
  });

  it('keeps going when fetch rejects outright', async () => {
    let n = 0;
    stubFetch(() => {
      n += 1;
      if (n === 1) throw new TypeError('Failed to fetch');
      return json(reply({ reply: 'Ok.' }));
    });
    const { result } = renderHook(() => useDeviceAssistant('garcias'));
    await act(async () => {
      await result.current.send('hi');
    });
    expect(result.current.error).toBe('Failed to fetch');
    expect(result.current.turns[1]!.error).toBe(true);
    await act(async () => {
      await result.current.send('hi again');
    });
    expect(result.current.turns.at(-1)!.text).toBe('Ok.');
  });
});

describe('useDeviceAssistant with injected send', () => {
  it('ignores blank text without sending', async () => {
    const send = vi.fn(async () => reply());
    const { result } = renderHook(() => useDeviceAssistant('garcias', { send }));
    let out: AssistantResponse | undefined = reply();
    await act(async () => {
      out = await result.current.send('   ');
    });
    expect(out).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(result.current.turns).toHaveLength(0);
  });

  it('omits partyCode while the lookup is unresolved and keeps the speaker on the user turn', async () => {
    const send = vi.fn(async (_req: AssistantRequest) => reply());
    const speaker = { memberName: 'Maya', confidence: 0.8, source: 'voice-id' as const };
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const { result } = renderHook(() => useDeviceAssistant('garcias', { send }));
    await act(async () => {
      await result.current.send('hello', speaker);
    });
    const req = send.mock.calls[0]![0];
    expect('partyCode' in req).toBe(false);
    expect(req.speaker).toEqual(speaker);
    expect(result.current.turns[0]).toMatchObject({ role: 'user', speaker });
  });

  it('keeps an adopted code even when a late resolve arrives', async () => {
    let resolveFetch: (r: Response) => void = () => undefined;
    const pendingLookup = new Promise<Response>((r) => {
      resolveFetch = r;
    });
    vi.stubGlobal('fetch', vi.fn(() => pendingLookup));
    const send = vi.fn(async () => reply({ partyCode: 'ABCD' }));
    const { result } = renderHook(() => useDeviceAssistant('garcias', { send }));

    await act(async () => {
      await result.current.send('go');
    });
    expect(result.current.partyCode).toBe('ABCD');

    await act(async () => {
      resolveFetch(json({ code: 'LATE' }));
      await pendingLookup;
    });
    expect(result.current.partyCode).toBe('ABCD');
  });

  it('keeps the latest uiResource across turns that have none and extracts structured content', async () => {
    const ui: UiResourcePayload = {
      uri: 'ui://board',
      toolName: 'show_board',
      toolInput: {},
      toolResult: { content: [], structuredContent: { rows: 3 } },
    };
    const responses = [reply({ uiResource: ui }), reply({ reply: 'no ui' })];
    const send = vi.fn(async () => responses.shift()!);
    const { result } = renderHook(() => useDeviceAssistant('garcias', { send }));

    await act(async () => {
      await result.current.send('show board');
    });
    expect(result.current.uiResource).toEqual(ui);
    expect(result.current.structured).toEqual({ rows: 3 });

    await act(async () => {
      await result.current.send('thanks');
    });
    expect(result.current.lastResponse?.reply).toBe('no ui');
    expect(result.current.uiResource).toEqual(ui);
    expect(result.current.structured).toEqual({ rows: 3 });
  });

  it('uses a generic message when the thrown value has no message', async () => {
    const send = vi.fn(async (): Promise<AssistantResponse> => {
      throw 'nope';
    });
    const { result } = renderHook(() => useDeviceAssistant('garcias', { send }));
    await act(async () => {
      await result.current.send('x');
    });
    expect(result.current.error).toBe('Could not reach the assistant.');
  });
});
