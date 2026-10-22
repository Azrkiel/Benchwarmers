import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from './avatar';

afterEach(cleanup);

it('falls back to initials when artwork fails and can load a replacement', () => {
  const { rerender } = render(<Avatar name="Maya Chen" avatar="/missing-avatar.png" />);
  fireEvent.error(screen.getByRole('img', { name: 'Maya Chen' }));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('MC')).toBeTruthy();
  rerender(<Avatar name="Maya Chen" avatar="/replacement-avatar.png" />);
  expect(screen.getByRole('img', { name: 'Maya Chen' }).getAttribute('src')).toBe('/replacement-avatar.png');
});
