import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { RoomView } from '@shared/room';
import { basketballFixture } from './fixtures/basketball';
import { announcementsFor, useRoomAnnouncements } from './useRoomAnnouncements';

afterEach(cleanup);

const lobby = basketballFixture('lobby', 4, 1000);
const open = basketballFixture('open', 4, 1000);
const locked = basketballFixture('locked', 4, 1000);
const resolved = basketballFixture('resolved', 4, 1000);

it('stays quiet for the first snapshot and for an unchanged one', () => {
  expect(announcementsFor(undefined, open)).toEqual([]);
  expect(announcementsFor(open, open)).toEqual([]);
});

it('announces a new call with known possession and never hints at the answer', () => {
  const [cue] = announcementsFor({ ...open, question: undefined } as RoomView, open);
  expect(cue!.text).toBe('Hawks ball. Next basket: two or three?');
  expect(announcementsFor(open, locked)).toEqual([]);
});

it('announces the result, the basket and a lead change after resolution', () => {
  const tightBefore = { ...locked, standings: locked.standings.map((row, i) => ({ ...row, rank: i === 1 ? 1 : row.rank === 1 ? 2 : row.rank })) };
  const texts = announcementsFor(tightBefore, resolved).map((cue) => cue.text);
  expect(texts).toContain('Three. 1 called it.');
  expect(texts).toContain('Three for the Hawks. Maya takes the lead.');
});

it('says "1 point" when several plays add up to one point', () => {
  const plays = [{ id: 'p-miss', text: 'Free throw missed.', kind: 'score', quarter: 1, clock: '5:00' }, { id: 'p-make', text: 'Free throw good.', kind: 'score', quarter: 1, clock: '5:00' }];
  const next = { ...locked, game: { ...locked.game, home: { ...locked.game.home, score: locked.game.home.score + 1 }, recentPlays: [...locked.game.recentPlays, ...plays] } } as RoomView;
  expect(announcementsFor(locked, next).map((cue) => cue.text)).toContain('1 point for the Hawks.');
});

it('leaves possession out when it is unknown', () => {
  const unknown = { ...open, game: { ...open.game, context: { sport: 'basketball' as const, possessionTeamId: null, possessionPlayerId: null, ball: null, tracking: 'score_only' as const } } };
  expect(announcementsFor(lobby, unknown)[0]!.text).toBe('Next basket: two or three?');
});

it('speaks the single most important cue once and captions it', () => {
  const speak = vi.fn();
  const { result, rerender } = renderHook(({ view }) => useRoomAnnouncements(view, speak), { initialProps: { view: locked as RoomView } });
  expect(speak).not.toHaveBeenCalled();
  rerender({ view: resolved });
  expect(speak).toHaveBeenCalledTimes(1);
  expect(speak.mock.calls[0]![0]).toMatch(/^Three for the Hawks\./);
  expect(result.current.caption).toBe(speak.mock.calls[0]![0]);
  rerender({ view: { ...resolved } });
  expect(speak).toHaveBeenCalledTimes(1);
});
