import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { converseJson, getAiUsage, resetAiUsage } from '../../src/ai/bedrock.js';

const schema = z.object({ name: z.string(), n: z.number() });

function reply(text: string, inputTokens = 10, outputTokens = 5) {
  return { output: { message: { content: [{ text }] } }, usage: { inputTokens, outputTokens } };
}

type Sent = { input: { system: unknown; messages: Array<{ content: Array<{ text: string }> }>; inferenceConfig: unknown } };

beforeEach(() => resetAiUsage());

describe('converseJson', () => {
  it('parses valid JSON', async () => {
    const send = vi.fn().mockResolvedValue(reply('{"name":"a","n":1}'));
    const out = await converseJson({ system: 'sys', prompt: 'p', schema, maxTokens: 100, client: { send } });
    expect(out).toEqual({ name: 'a', n: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('extracts JSON from a fence with prose', async () => {
    const text = 'Sure! Here you go:\n```json\n{"name":"b {x}","n":2}\n```\nHope that helps.';
    const send = vi.fn().mockResolvedValue(reply(text));
    const out = await converseJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { send } });
    expect(out).toEqual({ name: 'b {x}', n: 2 });
  });

  it('extracts arrays', async () => {
    const send = vi.fn().mockResolvedValue(reply('result: [1,2,3] done'));
    const out = await converseJson({ system: 's', prompt: 'p', schema: z.array(z.number()), maxTokens: 10, client: { send } });
    expect(out).toEqual([1, 2, 3]);
  });

  it('retries once on invalid then succeeds', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(reply('{"name":1}'))
      .mockResolvedValueOnce(reply('{"name":"ok","n":3}'));
    const out = await converseJson({ system: 's', prompt: 'orig', schema, maxTokens: 100, client: { send } });
    expect(out).toEqual({ name: 'ok', n: 3 });
    expect(send).toHaveBeenCalledTimes(2);
    const retryText = (send.mock.calls[1]![0] as Sent).input.messages[0]!.content[0]!.text;
    expect(retryText).toContain('orig');
    expect(retryText).toContain('JSON only');
  });

  it('rejects after two invalid replies', async () => {
    const send = vi.fn().mockResolvedValue(reply('not json at all'));
    await expect(converseJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { send } })).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('throws on SDK error without retry and counts it', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(converseJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { send } })).rejects.toThrow('boom');
    expect(send).toHaveBeenCalledTimes(1);
    expect(getAiUsage().errors).toBe(1);
  });

  it('accumulates usage', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(reply('{"name":"a","n":1}', 10, 5))
      .mockResolvedValueOnce(reply('{"name":"b","n":2}', 7, 3));
    await converseJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { send } });
    await converseJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { send } });
    const u = getAiUsage();
    expect(u.calls).toBe(2);
    expect(u.inputTokens).toBe(17);
    expect(u.outputTokens).toBe(8);
    expect(u.totalLatencyMs).toBeGreaterThanOrEqual(0);
    resetAiUsage();
    expect(getAiUsage().calls).toBe(0);
  });

  it('passes system top-level and inference config', async () => {
    const send = vi.fn().mockResolvedValue(reply('{"name":"a","n":1}'));
    await converseJson({ system: 'SYS', prompt: 'PROMPT', schema, maxTokens: 321, client: { send } });
    const cmd = send.mock.calls[0]![0] as Sent;
    expect(cmd.input.system).toEqual([{ text: 'SYS' }]);
    expect(cmd.input.messages).toEqual([{ role: 'user', content: [{ text: 'PROMPT' }] }]);
    expect(cmd.input.inferenceConfig).toEqual({ maxTokens: 321, temperature: 0.7 });
  });
});
