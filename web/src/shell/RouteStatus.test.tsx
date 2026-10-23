import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotFound, PageTitle, RouteLoading } from './RouteStatus';

afterEach(cleanup);

it('provides a recoverable unknown route with code entry instead of a blank screen', () => {
  render(<MemoryRouter initialEntries={['/missing']}><Routes>
    <Route path="/room/:code" element={<h1>Room opened</h1>} />
    <Route path="*" element={<NotFound />} />
  </Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Game night' }).getAttribute('href')).toBe('/');
  fireEvent.change(screen.getByLabelText('Party code'), { target: { value: 'abcd' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open room' }));
  expect(screen.getByRole('heading', { name: 'Room opened' })).toBeTruthy();
});

it('names the loading state and page destination', () => {
  render(<MemoryRouter initialEntries={['/room/ABCD/tv']}><PageTitle /><RouteLoading /></MemoryRouter>);
  expect(screen.getByRole('status').textContent).toContain('Opening TV view');
  expect(document.title).toBe('TV view · Benchwarmers');
});
