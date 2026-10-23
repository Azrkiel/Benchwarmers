import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { basketballFixture } from './fixtures/basketball';
import { layoutFor, RoomDisplay, toDisplayModel } from './RoomDisplay';
import { BasketballCourt, trackStyle } from './BasketballCourt';
import { AUTO_SCROLL_MS, leaders, paginate, RoomStandings } from './RoomStandings';
import { RoomNav } from './RoomNav';
import { RoomResults } from './RoomResults';
import type { RoomViewNext } from './sport';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function display(view: RoomViewNext, props: Partial<Parameters<typeof RoomDisplay>[0]> = {}) {
  const onView = vi.fn();
  render(<RoomDisplay view={view} layout="compact" current="game" onView={onView} joinUrl="http://x/room/HOOP42" {...props} />);
  return onView;
}

describe('standings', () => {
  it('paginates at a fixed row count', () => {
    const rows = basketballFixture('open', 32).standings;
    expect(paginate(rows, 6).map((page) => page.length)).toEqual([6, 6, 6, 6, 6, 2]);
  });

  it('lists all 32 participants in one list with no pager', () => {
    const rows = basketballFixture('open', 32).standings;
    render(<RoomStandings rows={rows} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(32);
    expect(screen.getByText('32 players')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('auto-scrolls a list taller than its box, returns to the top, and holds after a touch', () => {
    vi.useFakeTimers();
    render(<RoomStandings rows={basketballFixture('open', 12).standings} />);
    const list = screen.getByRole('list');
    let top = 0;
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => top });
    const scrollBy = vi.fn((opts: ScrollToOptions) => { top = Math.min(300, top + (opts.top ?? 0)); });
    const scrollTo = vi.fn((opts: ScrollToOptions) => { top = opts.top ?? 0; });
    Object.assign(list, { scrollBy, scrollTo });
    act(() => { vi.advanceTimersByTime(AUTO_SCROLL_MS); });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20 && top < 300; i++) act(() => { vi.advanceTimersByTime(AUTO_SCROLL_MS); });
    expect(top).toBe(300);
    act(() => { vi.advanceTimersByTime(AUTO_SCROLL_MS * 2); });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(top).toBe(0);
    const calls = scrollBy.mock.calls.length;
    fireEvent.pointerDown(list);
    act(() => { vi.advanceTimersByTime(AUTO_SCROLL_MS * 2); });
    expect(scrollBy.mock.calls.length).toBe(calls);
  });

  it('does not move a list that fits', () => {
    vi.useFakeTimers();
    render(<RoomStandings rows={basketballFixture('open', 3).standings} />);
    const list = screen.getByRole('list');
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 300 });
    const scrollBy = vi.fn();
    Object.assign(list, { scrollBy });
    act(() => { vi.advanceTimersByTime(AUTO_SCROLL_MS * 4); });
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('adds the highlighted participant when outside the top rows', () => {
    const rows = basketballFixture('open', 10).standings;
    expect(leaders(rows, 3, rows[8]!.participantId).map((row) => row.participantId)).toEqual([...rows.slice(0, 3), rows[8]].map((row) => row!.participantId));
  });
});

