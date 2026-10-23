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

describe('room nav', () => {
  it('disables Results before final and moves between tabs with arrows', () => {
    const onChange = vi.fn();
    render(<RoomNav current="game" onChange={onChange} final={false} controls="x" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Game', 'Standings', 'Lineups', 'Results']);
    expect((screen.getByRole('tab', { name: 'Results' }) as HTMLButtonElement).disabled).toBe(true);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(document.activeElement?.textContent).toBe('Lineups');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('Game');
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(onChange).toHaveBeenCalledWith('standings');
  });
});

