import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ViewNav } from './ViewNav';

afterEach(cleanup);
const views = [{ mode: 'live' as const, label: 'Game' }, { mode: 'rosters' as const, label: 'Rosters' }];

describe('TV remote navigation', () => {
  it('moves focus with arrows and activates only on Select', () => {
    const select = vi.fn();
    render(<ViewNav views={views} mode="live" manual={false} onSelect={select} onClose={vi.fn()} />);
    const game = screen.getByRole('button', { name: 'Game' });
    const rosters = screen.getByRole('button', { name: 'Rosters' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(game);
    fireEvent.keyDown(game, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rosters);
    expect(select).not.toHaveBeenCalled();
    fireEvent.keyDown(rosters, { key: 'Enter' });
    expect(select).toHaveBeenCalledExactlyOnceWith('rosters');
    expect(game.getAttribute('aria-pressed')).toBe('true');
    expect(rosters.getAttribute('aria-pressed')).toBe('false');
  });

  it('supports Fire TV legacy key codes and keeps focus within the row', () => {
    const select = vi.fn();
    render(<ViewNav views={views} mode="live" manual={false} onSelect={select} onClose={vi.fn()} />);
    const game = screen.getByRole('button', { name: 'Game' });
    const rosters = screen.getByRole('button', { name: 'Rosters' });
    game.focus();
    fireEvent.keyDown(game, { keyCode: 37 });
    expect(document.activeElement).toBe(game);
    fireEvent.keyDown(game, { key: 'Unidentified', keyCode: 39 });
    expect(document.activeElement).toBe(rosters);
    fireEvent.keyDown(rosters, { keyCode: 39 });
    expect(document.activeElement).toBe(rosters);
    fireEvent.keyDown(rosters, { keyCode: 13 });
    expect(select).toHaveBeenCalledExactlyOnceWith('rosters');
  });

  it('treats Backspace as Back for laptop keyboards', () => {
    const close = vi.fn();
    render(<ViewNav views={views} mode="rosters" onSelect={vi.fn()} onClose={close} manual />);
    expect(fireEvent.keyDown(window, { key: 'Backspace' })).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it('handles Back only when returning from manual viewing', () => {
    const auto = vi.fn();
    const props = { views, mode: 'rosters' as const, onSelect: vi.fn(), onClose: auto };
    const { rerender } = render(<ViewNav {...props} manual />);
    expect(fireEvent.keyDown(window, { keyCode: 4 })).toBe(false);
    expect(auto).toHaveBeenCalledOnce();
    rerender(<ViewNav {...props} manual={false} />);
    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(true);
    expect(auto).toHaveBeenCalledOnce();
  });

  it('offers a mouse-accessible return to the game', () => {
    const select = vi.fn();
    render(<ViewNav views={views} mode="rosters" manual onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Game' }));
    expect(select).toHaveBeenCalledExactlyOnceWith('live');
  });

  it('keeps a tab stop when available views change with party status', () => {
    const props = { mode: 'live' as const, manual: false, onSelect: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<ViewNav {...props} views={views} />);
    screen.getByRole('button', { name: 'Rosters' }).focus();
    rerender(<ViewNav {...props} views={[views[0]!]} />);
    expect(screen.getByRole('button', { name: 'Game' }).tabIndex).toBe(0);
  });

  it('places initial remote focus on the selected view', () => {
    render(<ViewNav views={views} mode="rosters" manual onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rosters' }));
  });

  it('restores focus to the selected view when a focused destination disappears', () => {
    const props = { mode: 'live' as const, manual: false, onSelect: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<ViewNav {...props} views={views} />);
    screen.getByRole('button', { name: 'Rosters' }).focus();
    rerender(<ViewNav {...props} views={[views[0]!]} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Game' }));
  });

  it('does not repeatedly toggle a panel while Select is held', () => {
    const select = vi.fn();
    render(<ViewNav views={views} mode="live" manual={false} onSelect={select} onClose={vi.fn()} />);
    const game = screen.getByRole('button', { name: 'Game' });
    game.focus();
    fireEvent.keyDown(game, { key: 'Enter' });
    fireEvent.keyDown(game, { key: 'Enter', repeat: true });
    expect(select).toHaveBeenCalledExactlyOnceWith('live');
  });
});
