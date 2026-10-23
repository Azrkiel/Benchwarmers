import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeNav } from './HomeNav';

afterEach(cleanup);

it('lists Play, How it works and Season in order and marks the current page', () => {
  render(<MemoryRouter initialEntries={['/season']}><HomeNav /></MemoryRouter>);
  const links = screen.getAllByRole('link').filter((link) => link.closest('nav'));
  expect(links.map((link) => link.textContent)).toEqual(['Play', 'How it works', 'Season']);
  expect(screen.getByRole('link', { name: 'Season' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Play' }).getAttribute('aria-current')).toBeNull();
});
