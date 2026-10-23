import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoungePage } from './LoungePage';
import { liveFixture } from '../lib/fixtures';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

function show(url = '/lounge/DEMO?fixture=live') {
  return render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/lounge/:code" element={<LoungePage />} /></Routes></MemoryRouter>);
}

describe('Lounge version', () => {
  it('shows the actual matchup, crew seats, and a link to the preserved version', () => {
    show();
    expect(screen.getByRole('heading', { name: /Harbor Hawks.*Summit Foxes/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Standings' })).toBeTruthy();
    fireEvent.click(screen.getByText('Demo tools', { selector: 'summary' }));
    expect(screen.getByRole('link', { name: 'Broadcast view' }).getAttribute('href')).toBe('/tv2/DEMO?fixture=live');
  });

  it('moves through the sidebar without selecting until Enter', () => {
    show();
    const tonight = screen.getByRole('button', { name: 'Game' });
    const picks = screen.getByRole('button', { name: 'Picks' });
    expect(document.activeElement).toBe(tonight);
    fireEvent.keyDown(tonight, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(picks);
    expect(tonight.getAttribute('aria-current')).toBe('page');
    fireEvent.keyDown(picks, { key: 'Enter' });
    expect(picks.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Will the next score be a 3-pointer?' })).toBeTruthy();
  });

  it('opens picks from the primary action and restores focus on Back', () => {
    show();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const primary = screen.getByRole('button', { name: 'View picks' });
    expect(document.activeElement).toBe(primary);
    fireEvent.keyDown(primary, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    expect(screen.getByRole('button', { name: 'Picks' }).getAttribute('aria-current')).toBe('page');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View picks' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View picks' }));
  });

  it('opens a friend’s roster, confines modal focus, and returns to the same seat', () => {
    show();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const seat = screen.getByRole('button', { name: /Sam.*119.6/ });
    expect(document.activeElement).toBe(seat);
    fireEvent.keyDown(seat, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Sam’s roster' })).toBeTruthy();
    const close = screen.getByRole('button', { name: 'Close roster' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Roster players' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(seat);
  });

  it('offers a draft shortcut before play and results after the game', () => {
    const draft = show('/lounge/DEMO?fixture=drafting');
    fireEvent.click(screen.getByRole('button', { name: 'View draft' }));
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    draft.unmount();
    show('/lounge/DEMO?fixture=final');
    fireEvent.click(screen.getByRole('button', { name: 'View results' }));
    expect(screen.getByRole('heading', { name: 'Maya wins' })).toBeTruthy();
  });

  it('follows the visual two-row crew grid with Down and Up', () => {
    show('/lounge/DEMO?fixture=live&view=crew');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Maya.*142.5/ }));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Priya.*110.3/ }));
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Maya.*142.5/ }));
  });

  it('closes a vanished member’s roster and focuses the active destination', async () => {
    vi.useFakeTimers();
    let payload = liveFixture;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, json: async () => payload }) as Response);
    show('/lounge/DEMO');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Sam.*119.6/ }));
    expect(screen.getByRole('dialog', { name: 'Sam’s roster' })).toBeTruthy();
    payload = { ...liveFixture, version: 43, standings: liveFixture.standings.filter((member) => member.memberId !== 'sam') };
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Game' }));
  });

  it('provides a remote-reachable recovery link while the API is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    show('/lounge/DEMO');
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Party unavailable' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('link', { name: 'Edit code' })).toBeTruthy();
  });
});
