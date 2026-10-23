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

describe('room display', () => {
  it('picks compact for 960x480, medium for 1280x800 and tv for 1920x1080', () => {
    expect(layoutFor(960, 480)).toBe('compact');
    expect(layoutFor(1280, 800)).toBe('medium');
    expect(layoutFor(1280, 720)).toBe('medium');
    expect(layoutFor(1920, 1080)).toBe('tv');
  });

  it('shows score, one featured call, its status and top three leaders', () => {
    display(basketballFixture('open', 6));
    expect(screen.getByRole('region', { name: 'Score' }).textContent).toContain('42');
    const call = screen.getByRole('region', { name: 'Featured call' });
    expect(within(call).getByRole('heading').textContent).toBe('Next basket: two or three?');
    expect(within(call).getByRole('status').textContent).toMatch(/Closes in 0:0\d.*3 of 6 answered/);
    expect(within(screen.getByRole('complementary', { name: 'Room leaders' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('region', { name: 'Featured call' })).toHaveLength(1);
  });

  it('keeps tied ranks from the server', () => {
    display(basketballFixture('open', 6));
    const ranks = within(screen.getByRole('complementary', { name: 'Room leaders' })).getAllByRole('listitem').map((row) => row.querySelector('.rd-row-rank')?.textContent);
    expect(ranks).toEqual(['1', '2', '2']);
  });

  it('labels locked, resolved and stale states', () => {
    display(basketballFixture('locked'));
    expect(screen.getByText('Locked · Waiting for the play')).toBeTruthy();
    cleanup();
    display(basketballFixture('resolved'));
    expect(screen.getByLabelText('Correct')).toBeTruthy();
    cleanup();
    display(basketballFixture('stale'));
    expect(screen.getByText('Showing last update · Reconnecting')).toBeTruthy();
  });

  it('shows a void call as no result with its reason', () => {
    const view = basketballFixture('locked');
    view.question = { ...view.question!, status: 'void' as never, voidReason: 'No made basket before the horizon' } as never;
    display(view);
    expect(screen.getByText('No result · No made basket before the horizon · streaks kept')).toBeTruthy();
  });

  it('never renders private fields even when handed a private view', () => {
    const view = { ...basketballFixture('open'), me: { participantId: 'fx-0', name: 'Maya', currentPick: { questionId: 'bball-q-004', optionId: 'three' } } } as RoomViewNext;
    (view.game as unknown as Record<string, unknown>).hostToken = 'host-secret';
    const model = toDisplayModel(view) as RoomViewNext & { me?: unknown };
    expect(model.me).toBeUndefined();
    expect(JSON.stringify(model)).not.toContain('host-secret');
    display(view);
    expect(document.body.textContent).not.toContain('host-secret');
    expect(document.body.textContent).not.toContain('Your pick');
  });

  it('shows the join code in the lobby and the winner at final', () => {
    display(basketballFixture('lobby'));
    expect(screen.getByRole('heading', { name: 'Scan to join' })).toBeTruthy();
    cleanup();
    display(basketballFixture('final'));
    expect(screen.getByRole('heading', { name: 'Winner' })).toBeTruthy();
  });

  it('marks fixture data on screen', () => {
    display(basketballFixture('open'), { fixture: true });
    expect(screen.getByText('Fixture')).toBeTruthy();
  });

  it('opens all standings from the leaders card', () => {
    const onView = display(basketballFixture('open', 6));
    fireEvent.click(screen.getByRole('button', { name: 'All standings (6)' }));
    expect(onView).toHaveBeenCalledWith('standings');
  });
});

