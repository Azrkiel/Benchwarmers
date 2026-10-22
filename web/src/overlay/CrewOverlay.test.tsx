import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CrewOverlay } from './CrewOverlay';
import { liveFixture } from '../lib/fixtures';

afterEach(()=>{cleanup();vi.useRealTimers();});
it('opens crew information without a duplicate broadcast scoreboard and closes on Escape', async () => {
  render(<CrewOverlay read={vi.fn().mockResolvedValue(liveFixture)} width={1920} height={1080} />);
  expect(screen.queryByRole('region', {name:'Crew panel'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Open crew'}));
  await screen.findByText('Maya');
  expect(screen.queryByText('Harbor Hawks')).toBeNull();
  expect(screen.getByText(/Backend connected · Fictional game/)).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('region',{name:'Crew panel'}),{key:'Escape'});
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Open crew'}));
});
it('uses new backend state and exposes an unavailable source without showing fixture data', async () => {
  const read=vi.fn().mockRejectedValue(new Error('Backend offline'));
  render(<CrewOverlay read={read} width={1920} height={1080} />);
  fireEvent.click(screen.getByRole('button',{name:'Open crew'}));
  await screen.findByText(/Backend offline/);
  expect(screen.queryByText('Maya')).toBeNull();
  read.mockResolvedValue(liveFixture);
  fireEvent.click(screen.getByRole('button',{name:'Retry'}));
  await screen.findByText('Maya');
});
it('suspends the panel for host menus and never restores focus over the host', async () => {
  const read=vi.fn().mockResolvedValue(liveFixture);
  const view=render(<><button>Host menu</button><CrewOverlay read={read} width={1920} height={1080} /></>);
  fireEvent.click(screen.getByRole('button',{name:'Open crew'}));
  await screen.findByText('Maya');
  screen.getByRole('button',{name:'Host menu'}).focus();
  view.rerender(<><button>Host menu</button><CrewOverlay read={read} width={1920} height={1080} hostBusy /></>);
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Crew panel'})).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Host menu'}));
});
it('refreshes server totals and retains the last state with a stale-data notice on failure',async()=>{
  vi.useFakeTimers();
  const next=structuredClone(liveFixture);next.standings[0].total=999;next.version++;
  const read=vi.fn().mockResolvedValueOnce(liveFixture).mockResolvedValueOnce(next).mockRejectedValue(new Error('Offline'));
  render(<CrewOverlay read={read} width={1920} height={1080}/>);
  await act(async()=>{});
  fireEvent.click(screen.getByRole('button',{name:'Open crew'}));
  expect(screen.getByText('142.5')).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(screen.getByText('999.0')).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(screen.getByText('999.0')).toBeTruthy();
  expect(screen.getByText(/Showing the last data/)).toBeTruthy();
});
