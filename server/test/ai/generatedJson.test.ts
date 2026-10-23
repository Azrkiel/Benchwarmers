import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateGeminiJson } from '../../src/ai/gemini.js';

const schema = z.object({ name: z.string(), n: z.number() });

function reply(text: string) {
  return { candidates: [{ content: { role: 'model', parts: [{ text }] } }] };
}

describe('generateGeminiJson', () => {
  it('parses valid JSON', async () => {
    const generateContent = vi.fn().mockResolvedValue(reply('{"name":"a","n":1}'));
    const out = await generateGeminiJson({ system: 'sys', prompt: 'p', schema, maxTokens: 100, client: { generateContent } });
    expect(out).toEqual({ name: 'a', n: 1 });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('extracts JSON from a fence with prose', async () => {
    const text = 'Sure! Here you go:\n```json\n{"name":"b {x}","n":2}\n```\nHope that helps.';
    const generateContent = vi.fn().mockResolvedValue(reply(text));
    const out = await generateGeminiJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { generateContent } });
    expect(out).toEqual({ name: 'b {x}', n: 2 });
  });

  it('extracts arrays', async () => {
    const generateContent = vi.fn().mockResolvedValue(reply('result: [1,2,3] done'));
    const out = await generateGeminiJson({ system: 's', prompt: 'p', schema: z.array(z.number()), maxTokens: 10, client: { generateContent } });
    expect(out).toEqual([1, 2, 3]);
  });

  it('retries once on invalid then succeeds', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(reply('{"name":1}'))
      .mockResolvedValueOnce(reply('{"name":"ok","n":3}'));
    const out = await generateGeminiJson({ system: 's', prompt: 'orig', schema, maxTokens: 100, client: { generateContent } });
    expect(out).toEqual({ name: 'ok', n: 3 });
    expect(generateContent).toHaveBeenCalledTimes(2);
    const retryText = generateContent.mock.calls[1]![0].contents[0].parts[0].text;
    expect(retryText).toContain('orig');
    expect(retryText).toContain('valid JSON');
  });

  it('rejects after two invalid replies', async () => {
    const generateContent = vi.fn().mockResolvedValue(reply('not json at all'));
    await expect(generateGeminiJson({ system: 's', prompt: 'p', schema, maxTokens: 100, client: { generateContent } })).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
