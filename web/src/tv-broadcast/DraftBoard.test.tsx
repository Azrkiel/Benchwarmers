import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DraftBoard } from './DraftBoard';
import { draftingFixture } from '../lib/fixtures';

afterEach(cleanup);

describe('DraftBoard', () => {
  it('renders 16 cards with owners, count and on-the-clock', () => {
    render(<DraftBoard state={draftingFixture} />);
    expect(screen.getAllByTestId('draft-card')).toHaveLength(16);
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    expect(screen.getByText(/7 of 12/)).toBeTruthy();
    expect(screen.getAllByText('Maya').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Big Mo').length).toBeGreaterThan(0);
    const clock = screen.getAllByTestId('on-clock').map((n) => n.textContent);
    expect(clock.some((t) => t?.includes('Leo'))).toBe(true);
  });

  it('a drafted card shows the player and the owner', () => {
    render(<DraftBoard state={draftingFixture} />);
    const card = screen.getAllByText('Big Mo').map((n) => n.closest('[data-testid="draft-card"]')).find((c) => c?.textContent?.includes('Maya'));
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('Big Mo');
    expect(card!.textContent).toContain('Maya');
  });

  it('shows player identity once per card and ownership without a hidden flip face', () => {
    const { container } = render(<DraftBoard state={draftingFixture} />);
    expect(screen.getAllByText('Big Mo')).toHaveLength(1);
    expect(container.querySelector('.tv-flip-face')).toBeNull();
    expect(screen.getAllByText('Available').length).toBeGreaterThan(0);
  });
});
