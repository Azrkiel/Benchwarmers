import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { RoomView } from '@shared/room';
import { ordinal, useRoomMoments } from './moments';
import { fixture } from './roomFixture';

afterEach(cleanup);

const base = { ...fixture, room: { ...fixture.room, phase: 'live' } } as unknown as RoomView;
const play = (id: string, kind: string) => ({ id, kind, text: `${kind} text`, quarter: 1, clock: '10:00' });
function withPlays(plays: ReturnType<typeof play>[], home = 0): RoomView {
  return { ...base, game: { ...base.game, home: { ...base.game.home, score: home }, recentPlays: plays } };
}

describe('useRoomMoments', () => {
  it('does not announce plays already on screen at first load', () => {
    const { result } = renderHook(() => useRoomMoments(withPlays([play('a', 'td')], 7)), { wrapper: StrictMode });
    expect(result.current.banner).toBeNull();
  });

  it('announces a new touchdown in the scoring team colour', () => {
    const { result, rerender } = renderHook(({ view }) => useRoomMoments(view), { initialProps: { view: withPlays([play('a', 'normal')]) } });
    rerender({ view: withPlays([play('a', 'normal'), play('b', 'td')], 6) });
    expect(result.current.banner?.title).toBe('Touchdown');
    expect(result.current.banner?.sub).toBe('Hogs');
    expect(result.current.banner?.color).toBe('#a34');
  });

  it('toasts a flag instead of a full banner', () => {
    const { result, rerender } = renderHook(({ view }) => useRoomMoments(view), { initialProps: { view: withPlays([]) } });
    rerender({ view: withPlays([play('p', 'pen')]) });
    expect(result.current.banner).toBeNull();
    expect(result.current.toasts).toHaveLength(1);
  });

  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
