import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TvPage } from './TvPage';

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
    expect(screen.getByText('Draft night')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the final view from the final fixture without fetching', () => {
    const { container } = renderAt('/tv/DEMO?fixture=final');
    expect(container.querySelector('.tv-final')).toBeTruthy();
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
