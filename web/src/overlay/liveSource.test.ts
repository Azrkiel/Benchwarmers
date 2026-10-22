import { expect, it, vi } from 'vitest';
import { readParty, validPartyCode } from './liveSource';
import { liveFixture } from '../lib/fixtures';

it('resolves the current party from the backend before requesting state', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 'LIVE' })))
    .mockResolvedValueOnce(new Response(JSON.stringify(liveFixture)));
  expect(await readParty('latest', request)).toEqual(liveFixture);
  expect(request.mock.calls.map(call => call[0])).toEqual(['/api/crews/sunday-crew/current', '/api/parties/LIVE/state']);
});
it('rejects arbitrary paths, HTTP failures, and malformed backend data', async () => {
  expect(validPartyCode('../secret')).toBe(false);
  await expect(readParty('../secret', vi.fn())).rejects.toThrow('party code');
  await expect(readParty('DEMO', vi.fn().mockResolvedValue(new Response('{}', {status:503})))).rejects.toThrow('503');
  await expect(readParty('DEMO', vi.fn().mockResolvedValue(new Response('{}')))).rejects.toThrow('Invalid party data');
});
