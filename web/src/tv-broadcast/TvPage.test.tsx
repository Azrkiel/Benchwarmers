import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TvPage } from './TvPage';
import { finalFixture, seasonFixture } from '../lib/fixtures';

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tv/:code" element={<TvPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  document.documentElement.classList.remove('tv-kiosk');
  vi.useRealTimers();
});

describe('TvPage', () => {
  it('opens a pick from the game action and restores its focus on Back', () => {
    const { container } = renderAt('/tv/DEMO?fixture=live');
    const game = screen.getByRole('button', { name: 'Game' });
    fireEvent.keyDown(game, { key: 'ArrowDown' });
    const action = screen.getByRole('button', { name: 'View picks' });
    expect(document.activeElement).toBe(action);
    fireEvent.keyDown(action, { key: 'Enter' });
    expect(container.querySelector('.tv-pickbar')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    expect(container.querySelector('.tv-pickbar')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.tv-pickbar')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View picks' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(game);
  });

  it('moves between game actions, remembers their position, and returns to the menu', () => {
    renderAt('/tv/DEMO?fixture=live');
    const game = screen.getByRole('button', { name: 'Game' });
    fireEvent.keyDown(game, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const rosters = screen.getByRole('button', { name: 'View rosters' });
    expect(document.activeElement).toBe(rosters);
    fireEvent.keyDown(rosters, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rosters);
    fireEvent.keyDown(rosters, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(game);
    fireEvent.keyDown(game, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rosters);
    expect(fireEvent.keyDown(rosters, { key: 'Escape' })).toBe(false);
    expect(document.activeElement).toBe(game);
    expect(fireEvent.keyDown(game, { key: 'Escape' })).toBe(true);
  });

  it('offers a primary action appropriate to drafting and final phases', () => {
    const draft = renderAt('/tv/DEMO?fixture=drafting');
    fireEvent.click(screen.getByRole('button', { name: 'Open draft' }));
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    draft.unmount();
    renderAt('/tv/DEMO?fixture=final');
    fireEvent.click(screen.getByRole('button', { name: 'See results' }));
    expect(screen.getByText('Benchwarmer of the night')).toBeTruthy();
  });

  it('provides a game-night overview with the room and the next question', () => {
    renderAt('/tv/DEMO?fixture=live');
    expect(screen.getByRole('region', { name: 'Standings' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Will the next score be a 3-pointer?' })).toBeTruthy();
    expect(document.documentElement.classList.contains('tv-overlay')).toBe(false);
  });

  it('preserves a transparent interactive overlay when requested', () => {
    renderAt('/tv/DEMO?fixture=live&overlay=1');
    expect(document.documentElement.classList.contains('tv-overlay')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Standings' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'TV views' })).toBeTruthy();
  });

  it('keeps the game mounted while optional panels open and close', () => {
    const { container } = renderAt('/tv/DEMO?fixture=live');
    const game = container.querySelector('.tv-live');
    expect(game).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect(container.querySelector('.tv-live')).toBe(game);
    fireEvent.click(screen.getByRole('button', { name: 'Game' }));
    expect(container.querySelector('.tv-live')).toBe(game);
    fireEvent.click(screen.getByRole('button', { name: 'Standings' }));
    expect(container.querySelector('.tv-standings')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Standings' }));
    expect(container.querySelector('.tv-standings')).toBeNull();
  });

  it('provides a clean broadcast mode without interactive controls or a fake game', () => {
    const { container } = renderAt('/tv/DEMO?fixture=live&controls=0');
    expect(document.documentElement.classList.contains('tv-overlay')).toBe(false);
    expect(screen.getByRole('region', { name: 'Standings' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'TV views' })).toBeNull();
    expect(container.querySelector('.tv-court')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.tv-live-scoreboard')).toBeTruthy();
  });
  it('keeps panels closed until toggled, and never rotates away from the game', () => {
    vi.useFakeTimers();
    const { container } = renderAt('/tv/DEMO?fixture=live');
    expect(container.querySelector('.tv-rosters')).toBeNull();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(container.querySelector('.tv-rosters')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rosters' }));
    expect(container.querySelector('.tv-rosters')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(45_000); });
    expect(container.querySelector('.tv-rosters')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Game' }).getAttribute('aria-pressed')).toBe('true');
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(container.querySelector('.tv-rosters')).toBeNull();
  });

  it('preserves a manually opened roster through party phase changes', () => {
    vi.useFakeTimers();
    const { container } = renderAt('/tv/DEMO?fixture=cycle');
    act(() => { vi.advanceTimersByTime(20_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Rosters' }));
    expect(container.querySelector('.tv-rosters')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(container.querySelector('.tv-rosters')).toBeTruthy();
    expect(container.querySelector('.tv-final')).toBeNull();
  });

  it('keeps draft night optional before the game starts', () => {
    const { container } = renderAt('/tv/DEMO?fixture=drafting');
    expect(screen.queryByRole('heading', { name: 'Draft' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect(container.querySelector('.tv-draft')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the final view from the final fixture without fetching', () => {
    const { container } = renderAt('/tv/DEMO?fixture=final&mode=final');
    expect(container.querySelector('.tv-final')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries failed season standings when Results is reopened', async () => {
    let attempts = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/season')) {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true, json: async () => seasonFixture });
      }
      return Promise.resolve({ ok: true, json: async () => finalFixture });
    });
    const { container } = renderAt('/tv/DEMO?mode=final');
    await screen.findByText('Season standings unavailable.');
    const retry = screen.getByRole('button', { name: 'Retry season standings' });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(retry);
    await waitFor(() => expect(container.querySelectorAll('.tv-season-table tbody tr')).toHaveLength(seasonFixture.rows.length));
    expect(attempts).toBe(2);
    expect(document.activeElement).toBe(retry);
  });

  it('shows the benchwarmer panel and podium leader from the final fixture', () => {
    const { container } = renderAt('/tv/DEMO?fixture=final&mode=final');
    expect(screen.getByText('Benchwarmer of the night')).toBeTruthy();
    expect(container.querySelector('[data-place="1"] .tv-podium-name')!.textContent).toBe('Maya');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the rosters view when forced', () => {
    const { container } = renderAt('/tv/DEMO?fixture=live&mode=rosters');
    expect(container.querySelector('.tv-rosters')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rosters' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds tv-kiosk in kiosk mode', () => {
    renderAt('/tv/DEMO?fixture=live&kiosk=1');
    expect(document.documentElement.classList.contains('tv-kiosk')).toBe(true);
  });

  it('shows Connecting when the network fails and no state exists', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderAt('/tv/DEMO');
    expect(screen.getByText(/Connecting/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText(/Connecting/)).toBeTruthy();
  });
});
