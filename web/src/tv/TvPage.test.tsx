import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TvPage } from './TvPage';
import { liveFixture } from '../lib/fixtures';

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
});

describe('TvPage', () => {
  it('renders draft night from the drafting fixture without fetching', () => {
    renderAt('/tv/DEMO?fixture=drafting');
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the final view from the final fixture without fetching', () => {
    const { container } = renderAt('/tv/DEMO?fixture=final');
    expect(container.querySelector('.tv-final')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the benchwarmer panel and podium leader from the final fixture', () => {
    const { container } = renderAt('/tv/DEMO?fixture=final');
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
  it('offers an immediate retry with a route to edit the party code', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => liveFixture });
    renderAt('/tv/DEMO');
    await screen.findByRole('heading', { name: 'Party unavailable' });
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(document.activeElement).toBe(retry);
    expect(screen.getByRole('link', { name: 'Edit code' }).getAttribute('href')).toBe('/');
    fireEvent.click(retry);
    await screen.findByRole('navigation', { name: 'TV views' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reaches rotation and Home from the TV remote menu', () => {
    renderAt('/tv/DEMO?fixture=live');
    const rosters = screen.getByRole('button', { name: 'Rosters' }); rosters.focus();
    fireEvent.keyDown(rosters, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Auto rotate' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getAllByRole('link', { name: 'Home' }).find(el => el.closest('.tv-stage')));
  });

});
