import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

afterEach(cleanup);

it('keeps developer views behind demo tools while room entry and replay remain available', () => {
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Replay a game' })).toBeTruthy();
  const tools = screen.getByText('Demo tools').closest('details')!;
  expect(tools.open).toBe(false);
  fireEvent.click(screen.getByText('Demo tools'));
  expect(tools.open).toBe(true);
  expect(screen.getByRole('link', { name: /TV layout preview/ }).getAttribute('href')).toContain('/tv2/');
});
