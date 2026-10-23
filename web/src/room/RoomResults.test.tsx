import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { basketballFixture } from './fixtures/basketball';
import { layoutFor, RoomDisplay, toDisplayModel } from './RoomDisplay';
import { BasketballCourt, trackStyle } from './BasketballCourt';
import { leaders, paginate, RoomStandings } from './RoomStandings';
import { RoomNav } from './RoomNav';
import { RoomResults } from './RoomResults';
import type { RoomViewNext } from './sport';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function display(view: RoomViewNext, props: Partial<Parameters<typeof RoomDisplay>[0]> = {}) {
  const onView = vi.fn();
  render(<RoomDisplay view={view} layout="compact" current="game" onView={onView} joinUrl="http://x/room/HOOP42" {...props} />);
  return onView;
}

describe('results', () => {
  it('shows the winner first and unlocks Season after the pause', () => {
    vi.useFakeTimers();
    render(<RoomResults view={basketballFixture('final')} revealMs={6000} />);
    expect(screen.getByRole('heading', { name: 'Winner' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Season standings' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(6000); });
    fireEvent.click(screen.getByRole('button', { name: 'Season standings' }));
    expect(screen.getByRole('heading', { name: 'Friday season' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Friday season' }));
  });

  it('lets a host advance early and shows tied winners together', () => {
    const tied = basketballFixture('final');
    tied.standings = tied.standings.map((row, i) => i < 2 ? { ...row, rank: 1, total: 90 } : row);
    render(<RoomResults view={tied} host revealMs={6000} />);
    expect(screen.getByRole('heading', { name: 'Tied winners' })).toBeTruthy();
    expect(screen.getAllByText('90.0')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Show season now' }));
    expect(screen.getByRole('heading', { name: 'Friday season' })).toBeTruthy();
  });
});
