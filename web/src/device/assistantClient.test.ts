import { describe, expect, it, vi } from 'vitest';
import type { AssistantRequest } from '@shared/types';
import { HISTORY_TURNS, buildRequest, resolvePartyCode, structuredFrom, type DeviceTurn } from './assistantClient';

function res(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: 'x', json: async () => body } as unknown as Response;
}

function turn(i: number, role: 'user' | 'assistant' = 'user', extra: Partial<DeviceTurn> = {}): DeviceTurn {
  return { id: `t${i}`, role, text: `m${i}`, ...extra };
}

describe('buildRequest', () => {
  it('builds body with trimmed text and no undefined keys', () => {
    const req = buildRequest({ text: '  hello  ', household: 'garcias', turns: [] });
    expect(JSON.parse(JSON.stringify(req))).toEqual({ text: 'hello', household: 'garcias' });
    expect('partyCode' in req).toBe(false);
    expect('history' in req).toBe(false);
    expect('speaker' in req).toBe(false);
  });

  it('includes partyCode and speaker when given', () => {
    const speaker = { memberName: 'Maya', confidence: 0.9, source: 'voice-id' as const };
    const req = buildRequest({ text: 'hi', household: 'garcias', partyCode: 'ABCD', turns: [], speaker });
    expect(req).toEqual({ text: 'hi', household: 'garcias', partyCode: 'ABCD', speaker });
  });

  it('caps history at the most recent HISTORY_TURNS turns', () => {
    expect(HISTORY_TURNS).toBe(6);
    const turns = Array.from({ length: 9 }, (_, i) => turn(i, i % 2 ? 'assistant' : 'user'));
    const req = buildRequest({ text: 'now', household: 'h', turns });
    expect(req.history).toEqual(turns.slice(3).map((t) => ({ role: t.role, text: t.text })));
    expect(req.history).toHaveLength(6);
  });

  it('excludes error turns and strips extra fields from history', () => {
    const turns: DeviceTurn[] = [
      turn(1),
      turn(2, 'assistant', { error: true, text: 'Sorry, boom' }),
      turn(3, 'assistant', { toolCalls: [], mode: 'offline' }),
    ];
    const req = buildRequest({ text: 'x', household: 'h', turns });
    expect(req.history).toEqual([
      { role: 'user', text: 'm1' },
      { role: 'assistant', text: 'm3' },
    ]);
  });

  it('serialises to the expected JSON body', () => {
    const req: AssistantRequest = buildRequest({
      text: 'q',
      household: 'garcias',
      partyCode: 'DEMO',
      turns: [turn(1), turn(2, 'assistant')],
    });
    expect(JSON.parse(JSON.stringify(req))).toEqual({
      text: 'q',
      household: 'garcias',
      partyCode: 'DEMO',
      history: [
        { role: 'user', text: 'm1' },
        { role: 'assistant', text: 'm2' },
      ],
    });
  });
});

describe('resolvePartyCode', () => {
  it('returns the code from an ok response', async () => {
    const f = vi.fn(async () => res({ code: 'ABCD' }));
    await expect(resolvePartyCode('sunday-crew', f as unknown as typeof fetch)).resolves.toBe('ABCD');
    expect(f).toHaveBeenCalledWith('/api/crews/sunday-crew/current');
  });

  it('falls back to DEMO on 404', async () => {
    const f = async () => res({ error: 'nope' }, false, 404);
    await expect(resolvePartyCode('sunday-crew', f)).resolves.toBe('DEMO');
  });

  it('falls back to DEMO when fetch rejects', async () => {
    const f = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    };
    await expect(resolvePartyCode('sunday-crew', f)).resolves.toBe('DEMO');
  });

  it('falls back to DEMO on bad JSON or missing/empty code', async () => {
    const badJson = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('bad');
        },
      }) as unknown as Response;
    await expect(resolvePartyCode('c', badJson)).resolves.toBe('DEMO');
    await expect(resolvePartyCode('c', async () => res({}))).resolves.toBe('DEMO');
    await expect(resolvePartyCode('c', async () => res({ code: '' }))).resolves.toBe('DEMO');
    await expect(resolvePartyCode('c', async () => res(null))).resolves.toBe('DEMO');
  });
});

describe('structuredFrom', () => {
  it('returns structuredContent when it is a plain object', () => {
    expect(structuredFrom({ content: [], structuredContent: { a: 1 } })).toEqual({ a: 1 });
  });

  it('returns undefined for other shapes', () => {
    expect(structuredFrom(undefined)).toBeUndefined();
    expect(structuredFrom(null)).toBeUndefined();
    expect(structuredFrom('str')).toBeUndefined();
    expect(structuredFrom({})).toBeUndefined();
    expect(structuredFrom({ structuredContent: [1, 2] })).toBeUndefined();
    expect(structuredFrom({ structuredContent: 'x' })).toBeUndefined();
    expect(structuredFrom({ structuredContent: null })).toBeUndefined();
  });
});
