import { StrictMode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlayByPlay } from './PlayByPlay';
import { liveFixture } from '../lib/fixtures';

afterEach(cleanup);
it('slides only new events into the feed, preserving old event elements on reorder', () => {
  const initial = liveFixture.recentEvents[0]!;
  const next = { ...initial, id: 'new-play', text: 'A new touchdown' };
  const props = { households: liveFixture.households, homeColor: '#f51825', awayColor: '#fff' };
  const { container, rerender } = render(<StrictMode><PlayByPlay {...props} events={[initial]} /></StrictMode>);
  expect(container.querySelector('.is-new')).toBeNull();
  const existing = screen.getByText(initial.text);
  rerender(<StrictMode><PlayByPlay {...props} events={[next, initial]} /></StrictMode>);
  expect(container.querySelector('.tv-pbp-row.is-new')?.textContent).toContain(next.text);
  expect(screen.getByText(initial.text)).toBe(existing);
});
