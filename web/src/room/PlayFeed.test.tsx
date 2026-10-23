import { StrictMode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlayFeed } from './components';
import { fixture } from './roomFixture';
import type { RoomView } from '@shared/room';

afterEach(cleanup);
const play = (id: string, kind = 'td') => ({ id, kind, text: `Play ${id}`, quarter: 1, clock: '10:00' });
const view = (ids: string[]): RoomView => ({ ...fixture, game: { ...fixture.game, recentPlays: ids.map(id => play(id)) } });

it('animates arriving plays without celebrating historical plays or replaying on polls', () => {
  const { container, rerender } = render(<StrictMode><PlayFeed view={view(['a'])} tv /></StrictMode>);
  expect(container.querySelector('.is-new')).toBeNull();
  rerender(<StrictMode><PlayFeed view={view(['a', 'b'])} tv /></StrictMode>);
  expect(container.querySelector('.rm-play-latest.is-new')?.textContent).toContain('Play b');
  const latest = screen.getByText('Play b');
  rerender(<StrictMode><PlayFeed view={view(['a', 'b'])} tv /></StrictMode>);
  expect(screen.getByText('Play b')).toBe(latest);
});
