import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createGeminiClient, generateGeminiJson } from '../../src/ai/gemini.js';

const request = { contents: [{ role: 'user' as const, parts: [{ text: 'hello' }] }] };
const answer = (text = 'hello') => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});
const response = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });
const headersOf = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map(([, init]) => new Headers(init.headers).get('x-goog-api-key'));

afterEach(() => vi.unstubAllEnvs());

describe('Gemini key pool', () => {
  it('accepts a single key or a deduplicated key pool without putting keys in URLs', async () => {
    vi.stubEnv('GEMINI_API_KEYS', 'first, second\nfirst');
    vi.stubEnv('GEMINI_API_KEY', 'single');
    const fetch = vi.fn().mockImplementation(async () => response(answer()));
    const client = createGeminiClient({ fetch });
    await client.generateContent(request);
    expect(headersOf(fetch)).toEqual(['first']);
    expect(fetch.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(fetch.mock.calls[0][0]).not.toContain('first');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...request, generationConfig: { thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    });
    vi.stubEnv('GEMINI_API_KEYS', '');
    await createGeminiClient({ fetch }).generateContent(request);
    expect(headersOf(fetch)).toEqual(['first', 'single']);
  });

  it('fails over on 429, honors Retry-After and resumes a key after cooldown', async () => {
    let now = 1000;
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ error: {} }, 429, { 'Retry-After': '120' }))
      .mockImplementation(async () => response(answer()));
    const client = createGeminiClient({ apiKeys: ['a', 'b'], fetch, now: () => now });
    await client.generateContent(request);
    await client.generateContent(request);
    expect(headersOf(fetch)).toEqual(['a', 'b', 'b']);
    // If b fails before a's Retry-After expires, a must still be skipped.
    fetch.mockResolvedValueOnce(response({}, 503));
    await expect(client.generateContent(request)).rejects.toThrow(/unavailable|cooldown/i);
    expect(headersOf(fetch)).toEqual(['a', 'b', 'b', 'b']);
    now = 122000;
    await client.generateContent(request);
    expect(headersOf(fetch).at(-1)).toBe('a');
  });

  it('honors Google RetryInfo and HTTP-date Retry-After', async () => {
    let now = Date.parse('2026-10-20T12:00:00Z');
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ error: { details: [{ retryDelay: '180s' }] } }, 429,
        { 'Retry-After': 'Tue, 20 Oct 2026 12:02:00 GMT' }))
      .mockImplementation(async () => response(answer()));
    const client = createGeminiClient({ apiKeys: ['a'], fetch, now: () => now });
    await expect(client.generateContent(request)).rejects.toThrow();
    now += 150000;
    await expect(client.generateContent(request)).rejects.toThrow(/cooldown|unavailable/i);
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 31000;
    await client.generateContent(request);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('disables rejected credentials and switches to the next key', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 400))
      .mockImplementation(async () => response(answer()));
    const client = createGeminiClient({ apiKeys: ['invalid', 'valid'], fetch });
    await client.generateContent(request);
    await client.generateContent(request);
    expect(headersOf(fetch)).toEqual(['invalid', 'valid', 'valid']);
  });

  it.each([401, 403, 500, 502, 503, 504])('fails over on HTTP %s', async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(response({}, status)).mockResolvedValueOnce(response(answer()));
    await createGeminiClient({ apiKeys: ['a', 'b'], fetch }).generateContent(request);
    expect(headersOf(fetch)).toEqual(['a', 'b']);
  });

  it.each([400, 404])('does not retry invalid requests/models (HTTP %s) on other keys', async (status) => {
    const fetch = vi.fn().mockResolvedValue(response({ error: { message: 'raw-secret-from-google' } }, status));
    await expect(createGeminiClient({ apiKeys: ['a', 'b'], fetch }).generateContent(request)).rejects.toThrow('HTTP ' + status);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds attempts, skips cooling keys on the next call, and redacts error bodies', async () => {
    const fetch = vi.fn().mockImplementation(async () => response({ error: { message: 'key-a key-b secret' } }, 429));
    const client = createGeminiClient({ apiKeys: ['key-a', 'key-b', 'key-a'], fetch });
    const error = await client.generateContent(request).catch((e: Error) => e);
    expect(String(error)).not.toMatch(/key-a|key-b|secret/);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(client.generateContent(request)).rejects.toThrow(/unavailable|cooldown/i);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails over on network errors without exposing their messages', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('secret key-a')).mockResolvedValueOnce(response(answer()));
    await createGeminiClient({ apiKeys: ['key-a', 'key-b'], fetch }).generateContent(request);
    expect(headersOf(fetch)).toEqual(['key-a', 'key-b']);
    const broken = vi.fn().mockRejectedValue(new Error('secret key-a'));
    await expect(createGeminiClient({ apiKeys: ['key-a'], fetch: broken }).generateContent(request)).rejects.not.toThrow(/secret|key-a/);
  });

  it('passes an abort signal and stops a timed-out request', async () => {
    const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    await expect(createGeminiClient({ apiKeys: ['a'], fetch, timeoutMs: 15 }).generateContent(request)).rejects.toThrow();
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves time to switch keys after an attempt times out', async () => {
    const fetch = vi.fn()
      .mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      }))
      .mockResolvedValueOnce(response(answer()));
    await createGeminiClient({ apiKeys: ['a', 'b'], fetch, timeoutMs: 200 }).generateContent(request);
    expect(headersOf(fetch)).toEqual(['a', 'b']);
  });

  it('fails over when reading the response body encounters a network error', async () => {
    const brokenBody = { ok: true, json: vi.fn().mockRejectedValue(new TypeError('secret body connection error')) };
    const fetch = vi.fn().mockResolvedValueOnce(brokenBody).mockResolvedValueOnce(response(answer()));
    await createGeminiClient({ apiKeys: ['a', 'b'], fetch }).generateContent(request);
    expect(headersOf(fetch)).toEqual(['a', 'b']);
  });

  it('makes no request without credentials and rejects malformed model ids', async () => {
    const fetch = vi.fn();
    await expect(createGeminiClient({ apiKeys: [], fetch }).generateContent(request)).rejects.toThrow(/GEMINI_API_KEY/);
    expect(() => createGeminiClient({ apiKeys: ['a'], modelId: '../secret?key=leak', fetch })).toThrow(/model/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['gemini-3.8-flash', { thinkingLevel: 'MINIMAL' }],
    ['gemini-3.1-pro-preview', { thinkingLevel: 'LOW' }],
    ['gemini-2.5-flash', { thinkingBudget: 0 }],
  ])('uses compatible short-answer thinking settings for %s', async (modelId, thinkingConfig) => {
    const fetch = vi.fn().mockResolvedValue(response(answer()));
    await createGeminiClient({ apiKeys: ['a'], modelId, fetch }).generateContent(request);
    expect(JSON.parse(fetch.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual(thinkingConfig);
  });
});

describe('Gemini JSON generation', () => {
  it('validates JSON, ignores thought text and requests JSON output', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [{ content: { role: 'model', parts: [{ text: 'private thought', thought: true }, { text: '{"text":"hello"}' }] } }],
    });
    const out = await generateGeminiJson({
      system: 'sys', prompt: 'p', maxTokens: 200, schema: z.object({ text: z.string() }), client: { generateContent },
    });
    expect(out).toEqual({ text: 'hello' });
    expect(generateContent.mock.calls[0][0].generationConfig.responseMimeType).toBe('application/json');
  });

  it('retries schema-invalid JSON once with correction instructions', async () => {
    const generateContent = vi.fn()
      .mockResolvedValueOnce(answer('{"wrong":1}'))
      .mockResolvedValueOnce(answer('{"text":"fixed"}'));
    const out = await generateGeminiJson({
      system: 'sys', prompt: 'p', maxTokens: 200, schema: z.object({ text: z.string() }), client: { generateContent },
    });
    expect(out.text).toBe('fixed');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generateContent.mock.calls[1][0])).toContain('valid JSON');
  });

  it('stops after two invalid replies and does not retry blocked or truncated replies', async () => {
    const generateContent = vi.fn().mockResolvedValue(answer('no JSON'));
    const opts = { system: 'sys', prompt: 'p', maxTokens: 200, schema: z.object({ text: z.string() }), client: { generateContent } };
    await expect(generateGeminiJson(opts)).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledTimes(2);
    generateContent.mockClear().mockResolvedValue({ promptFeedback: { blockReason: 'SAFETY' } });
    await expect(generateGeminiJson(opts)).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledTimes(1);
    generateContent.mockClear().mockResolvedValue({ ...answer('{"text":"partial"}'), candidates: [{ ...answer().candidates[0], finishReason: 'MAX_TOKENS' }] });
    await expect(generateGeminiJson(opts)).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
