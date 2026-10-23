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

describe('standings', () => {
  it('paginates 32 participants at a fixed row count and reaches everyone', () => {
    const rows = basketballFixture('open', 32).standings;
    expect(paginate(rows, 6).map((page) => page.length)).toEqual([6, 6, 6, 6, 6, 2]);
    render(<RoomStandings rows={rows} perPage={6} />);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      for (const item of screen.getAllByRole('listitem')) seen.add(item.querySelector('.rd-row-name')!.textContent!);
      const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
      if (!next.disabled) fireEvent.click(next);
    }
    expect(seen.size).toBe(32);
    expect(screen.getByText('Page 6 of 6')).toBeTruthy();
  });

  it('adds the highlighted participant when outside the top rows', () => {
    const rows = basketballFixture('open', 10).standings;
    expect(leaders(rows, 3, rows[8]!.participantId).map((row) => row.participantId)).toEqual([...rows.slice(0, 3), rows[8]].map((row) => row!.participantId));
  });
});

