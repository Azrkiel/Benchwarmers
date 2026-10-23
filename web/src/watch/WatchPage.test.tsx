import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WatchPage, youtubeId } from './WatchPage';

afterEach(cleanup);
function show() {
  render(<MemoryRouter initialEntries={['/watch/DEMO?fixture=live']}><Routes><Route path="/watch/:code" element={<WatchPage />} /></Routes></MemoryRouter>);
}
it('accepts only supported YouTube video URLs', () => {
  expect(youtubeId('https://youtu.be/lsZDzZbO_aY?t=20')).toBe('lsZDzZbO_aY');
  expect(youtubeId('https://www.youtube.com/watch?v=lsZDzZbO_aY')).toBe('lsZDzZbO_aY');
  expect(youtubeId('https://www.youtube.com/live/lsZDzZbO_aY')).toBe('lsZDzZbO_aY');
  expect(youtubeId('https://youtube.com.evil.test/watch?v=lsZDzZbO_aY')).toBeNull();
  expect(youtubeId('javascript:alert(1)')).toBeNull();
});
it('keeps the video clear until a bounded information panel is requested', () => {
  show();
  expect(screen.queryByRole('region', {name:'Companion panel'})).toBeNull();
  expect(screen.getByText('Demo replay · Not synced to video')).toBeTruthy();
});
it('changes panels and hides the overlay without reloading the player', () => {
  show();
  const video = screen.getByTitle('YouTube video');
  fireEvent.click(screen.getByRole('button', { name: 'Crew panels' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rosters' }));
  expect(screen.getByRole('region', {name:'Companion panel'})).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('region', {name:'Companion panel'}), { key: 'Escape' });
  expect(screen.queryByRole('region', {name:'Companion panel'})).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', {name:'Rosters'}));
  expect(screen.getByTitle('YouTube video')).toBe(video);
});
it('rejects an unsupported source without replacing the playing video', () => {
  show();
  const video = screen.getByTitle('YouTube video');
  fireEvent.change(screen.getByLabelText('YouTube link'), { target: { value: 'https://example.com/private' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load video' }));
  expect(screen.getByRole('alert').textContent).toContain('YouTube');
  expect(screen.getByTitle('YouTube video')).toBe(video);
  fireEvent.change(screen.getByLabelText('YouTube link'), { target: { value: 'https://youtu.be/Sc8jX2B0olE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load video' }));
  expect(screen.getByTitle('YouTube video').getAttribute('src')).toContain('/Sc8jX2B0olE?');
});
