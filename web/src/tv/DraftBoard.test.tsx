import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DraftBoard } from './DraftBoard';
import { draftingFixture } from '../lib/fixtures';

afterEach(cleanup);

describe('DraftBoard', () => {
  it('renders 16 cards with owners, count and on-the-clock', () => {
    render(<DraftBoard state={draftingFixture} />);
    expect(screen.getAllByTestId('draft-card')).toHaveLength(16);
    expect(screen.getByText('Draft night')).toBeTruthy();
    expect(screen.getByText(/7 of 12/)).toBeTruthy();
    expect(screen.getAllByText('Maya').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Big Mo').length).toBeGreaterThan(0);
    const clock = screen.getAllByTestId('on-clock').map((n) => n.textContent);
    expect(clock.some((t) => t?.includes('Leo'))).toBe(true);
  });
});
