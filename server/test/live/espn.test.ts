import { describe, expect, it } from 'vitest';
import { EspnError, resolveGame, type FetchLike } from '../../src/live/espn.js';

// Hand-made, ESPN-shaped responses with invented teams: no real payloads, no network.
const team = (id: string, abbreviation: string, location: string, nickname: string) => ({
  team: { id, abbreviation, location, nickname, displayName: `${location} ${nickname}`, shortDisplayName: location },
});
const TEAMS = {
  sports: [
    {
      leagues: [
        {
          teams: [
            team('1', 'LKV', 'Lakeview', 'Herons'),
            team('2', 'NGT', 'Northgate', 'Wolves'),
            team('3', 'NGS', 'Northgate State', 'Bears'),
            team('4', 'ALP', 'Alpine', 'Wolves'),
            team('5', 'ONE', 'Oneida', 'Eagles'),
          ],
        },
      ],
    },
  ],
};
const ev = (id: string, name: string, date: string, completed: boolean, ids: string[]) => ({
  id,
  name,
  date,
  competitions: [
    {
      status: { type: { completed, description: completed ? 'Final' : 'Scheduled' } },
      competitors: ids.map((i) => ({ id: i })),
    },
  ],
});
const SCHEDULE = {
  events: [
    ev('11', 'Northgate Wolves at Lakeview Herons', '2024-09-07T20:00Z', true, ['1', '2']),
    ev('12', 'Lakeview Herons at Northgate Wolves', '2024-11-30T20:00Z', true, ['1', '2']),
    ev('13', 'Lakeview Herons at Northgate Wolves (rematch)', '2024-12-20T20:00Z', false, ['1', '2']),
    ev('14', 'Lakeview Herons at Oneida Eagles', '2024-10-01T20:00Z', true, ['1', '5']),
  ],
};
const EMPTY = { events: [] };
const SUMMARY = {
  header: {
    id: '401777777',
    competitions: [
      {
        date: '2024-10-05T20:00Z',
        status: { type: { completed: true, description: 'Final' } },
        competitors: [
          { homeAway: 'home', team: { displayName: 'Lakeview Herons' } },
          { homeAway: 'away', team: { displayName: 'Northgate Wolves' } },
        ],
      },
    ],
  },
};

function fakeFetch(log: string[] = []): FetchLike {
  return async (url) => {
    log.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.includes('/nfl/teams?')) return json({ sports: [{ leagues: [{ teams: [] }] }] });
    if (url.includes('/college-football/teams?')) return json(TEAMS);
    if (url.includes('/schedule?season=2024&seasontype=3')) return json(EMPTY);
    if (url.includes('/teams/1/schedule?season=2024')) return json(SCHEDULE);
    if (url.includes('/schedule?')) return json(EMPTY);
    if (url.includes('/college-football/summary?event=401777777')) return json(SUMMARY);
    if (url.includes('/summary?')) return json({ code: 404 }, 404);
    return json({}, 500);
  };
}

describe('resolveGame', () => {
  it('resolves "A vs B year" by abbreviation and picks the most recent completed meeting', async () => {
    const r = await resolveGame('LKV vs NGT 2024', { fetch: fakeFetch() });
    expect(r).toMatchObject({ eventId: '12', league: 'college-football', status: 'Final', completed: true });
    expect(r.title).toBe('Lakeview Herons at Northgate Wolves');
  });

  it('accepts school names with no separator', async () => {
    const r = await resolveGame('Lakeview Northgate 2024', { fetch: fakeFetch() });
    expect(r.eventId).toBe('12');
  });

  it('prefers the exact school over a longer name that contains it', async () => {
    const r = await resolveGame('Lakeview at Northgate 2024', { fetch: fakeFetch() });
    expect(r.eventId).toBe('12');
  });

  it('resolves a unique nickname', async () => {
    const r = await resolveGame('Herons vs NGT 2024', { fetch: fakeFetch() });
    expect(r.eventId).toBe('12');
  });

  it('asks for a clearer name when a nickname matches several teams', async () => {
    await expect(resolveGame('Lakeview vs Wolves 2024', { fetch: fakeFetch() })).rejects.toThrow(/could be/);
  });

  it('falls back to an upcoming game only when nothing finished', async () => {
    const f: FetchLike = async (url) => {
      const base = await fakeFetch()(url);
      if (!url.includes('/teams/1/schedule?season=2024') || url.includes('seasontype')) return base;
      return new Response(JSON.stringify({ events: [SCHEDULE.events[2]] }));
    };
    const r = await resolveGame('LKV vs NGT 2024', { fetch: f });
    expect(r).toMatchObject({ eventId: '13', completed: false });
  });

  it('404-style error when the teams never met that season', async () => {
    const err = await resolveGame('LKV vs NGT 2023', { fetch: fakeFetch() }).catch((e) => e);
    expect(err).toBeInstanceOf(EspnError);
    expect(err.kind).toBe('not_found');
    expect(err.message).toMatch(/no game between them in 2023/);
  });

  it('not_found for unknown teams', async () => {
    await expect(resolveGame('Zzz vs Qqq 2024', { fetch: fakeFetch() })).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('defaults the season when none is given (tries this season, then the one before)', async () => {
    const log: string[] = [];
    const r = await resolveGame('LKV vs NGT', { fetch: fakeFetch(log), now: () => new Date('2025-01-15T00:00:00Z') });
    expect(r.eventId).toBe('12'); // Jan 2025 -> season 2024
    expect(log.some((u) => u.includes('season=2024'))).toBe(true);
  });

  it('takes a bare event id or an ESPN URL and returns the summary it already fetched', async () => {
    const byId = await resolveGame('401777777', { fetch: fakeFetch() });
    expect(byId).toMatchObject({ eventId: '401777777', league: 'college-football', title: 'Northgate Wolves at Lakeview Herons', completed: true });
    expect(byId.summary).toBeDefined();
    const byUrl = await resolveGame('https://www.espn.com/college-football/game/_/gameId/401777777/northgate-lakeview', { fetch: fakeFetch() });
    expect(byUrl.eventId).toBe('401777777');
    await expect(resolveGame('999999', { fetch: fakeFetch() })).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('rejects an empty query', async () => {
    await expect(resolveGame('   ')).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('turns network failures and timeouts into upstream errors', async () => {
    const down: FetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    await expect(resolveGame('LKV vs NGT 2024', { fetch: down })).rejects.toMatchObject({ kind: 'upstream' });
    const hang: FetchLike = (_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(resolveGame('LKV vs NGT 2024', { fetch: hang, timeoutMs: 20 })).rejects.toThrow(/too long/);
    const five: FetchLike = async () => new Response('x', { status: 503 });
    await expect(resolveGame('LKV vs NGT 2024', { fetch: five })).rejects.toMatchObject({ kind: 'upstream' });
  });
});
