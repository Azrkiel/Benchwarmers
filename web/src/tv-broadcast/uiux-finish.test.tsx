import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { liveFixture, finalFixture } from '../lib/fixtures';
import { tooSmall, StageNotice } from './StageNotice';
import { Stage } from './Stage';
import { Stage as OriginalStage } from '../tv/Stage';
import { ReconnectBanner } from './ReconnectBanner';
import { ResultAnnouncement } from './ResultAnnouncement';
import { FinalView } from './FinalView';
import { Leader } from './Leader';
import { Leader as OriginalLeader } from '../tv/Leader';
import { DraftBoard } from '../tv/DraftBoard';
import { RostersView } from '../tv/RostersView';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function size(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

describe('G14 minimum viewport', () => {
  it('flags narrow or short viewports', () => {
    expect(tooSmall(899, 1080)).toBe(true);
    expect(tooSmall(1920, 499)).toBe(true);
    expect(tooSmall(1280, 720)).toBe(false);
  });
  it('shows the notice in both stages only when too small', () => {
    size(640, 360);
    for (const S of [Stage, OriginalStage]) {
      const { container, unmount } = render(<S><i /></S>);
      expect(screen.getByText('TV view needs a larger screen')).toBeTruthy();
      expect(container.querySelector('.is-too-small')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
      unmount();
    }
    size(1920, 1080);
    const { container } = render(<Stage><i /></Stage>);
    expect(container.querySelector('.tv-small-screen')).toBeNull();
    render(<StageNotice />);
  });
});

describe('G13 leader copy', () => {
  it('uses Leader without emoji', () => {
    const row = liveFixture.standings[0]!;
    for (const L of [Leader, OriginalLeader]) {
      const { container, unmount } = render(<L row={row} state={liveFixture} />);
      const k = container.querySelector('.tv-leader-kicker')!;
      expect(k.textContent).toContain('Leader');
      expect(k.textContent).not.toContain('Top of the bench');
      expect(k.textContent).not.toContain('👑');
      unmount();
    }
  });
});

describe('T20 reconnect banner', () => {
  it('shows age of stale data', () => {
    vi.useFakeTimers();
    const state = {};
    const r = render(<MemoryRouter><ReconnectBanner state={state} error={undefined} retry={() => {}} /></MemoryRouter>);
    r.rerender(<MemoryRouter><ReconnectBanner state={state} error="x" retry={() => {}} /></MemoryRouter>);
    const banner = r.container.querySelector('.tv-reconnecting')!;
    expect(banner.textContent).toContain('Showing update from 0:00 ago');
    act(() => { vi.advanceTimersByTime(42_000); });
    expect(banner.textContent).toContain('Showing update from 0:42 ago');
    // Only the interruption itself is announced; the ticking age stays out of the live region.
    expect(screen.getByRole('status').textContent).toBe('Connection interrupted');
  });
});

describe('B06 result announcement', () => {
  it('announces once when status turns final', () => {
    const { rerender } = render(<ResultAnnouncement state={liveFixture} />);
    const region = screen.getByTestId('result-announcement');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    const fin = { ...liveFixture, party: { ...liveFixture.party, status: 'final' as const } };
    rerender(<ResultAnnouncement state={fin} />);
    expect(region.textContent).toMatch(/^Final:/);
    rerender(<ResultAnnouncement state={{ ...fin }} />);
    expect(region.textContent).toMatch(/^Final:/);
  });
});

describe('T18 bounded recap', () => {
  it('puts a long recap in an expandable details', () => {
    const long = 'x '.repeat(200);
    const { container } = render(<FinalView state={{ ...finalFixture, recap: long }} serverNow={() => 0} />);
    expect(container.querySelector('[data-testid="recap-details"] .tv-recap-text')).toBeTruthy();
  });
  it('keeps a short recap inline', () => {
    const { container } = render(<FinalView state={{ ...finalFixture, recap: 'Short.' }} serverNow={() => 0} />);
    expect(container.querySelector('[data-testid="recap-details"]')).toBeNull();
    expect(container.querySelector('blockquote.tv-recap-text')).toBeTruthy();
  });
});

describe('T06 draft owner flash', () => {
  it('flashes a card when its owner changes', () => {
    vi.useFakeTimers();
    const idx = liveFixture.draftBoard.findIndex((e) => e.ownerMemberId);
    const base = { ...liveFixture, draftBoard: liveFixture.draftBoard.map((e, i) => (i === idx ? { ...e, ownerMemberId: undefined, ownerName: undefined } : e)) } as typeof liveFixture;
    const { container, rerender } = render(<DraftBoard state={base} />);
    expect(container.querySelector('.is-flash')).toBeNull();
    rerender(<DraftBoard state={liveFixture} />);
    expect(container.querySelectorAll('.is-flash')).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1300); });
    expect(container.querySelector('.is-flash')).toBeNull();
  });
});

describe('T16 roster paging', () => {
  it('pages members four at a time', () => {
    const extra = liveFixture.standings.map((s, i) => ({ ...s, memberId: `${s.memberId}-x${i}`, name: `${s.name} B`, rank: s.rank + 4 }));
    const state = { ...liveFixture, standings: [...liveFixture.standings, ...extra] };
    const { container } = render(<RostersView state={state} serverNow={() => 0} />);
    expect(container.querySelectorAll('.tv-roster-col')).toHaveLength(4);
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.hasAttribute('data-tv-action')).toBe(true);
    fireEvent.click(next);
    expect(container.querySelectorAll('.tv-roster-col')).toHaveLength(4);
    expect(container.querySelector('[data-member$="-x0"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(container.querySelector('[data-member$="-x0"]')).toBeNull();
  });
  it('hides pager with four or fewer', () => {
    render(<RostersView state={liveFixture} serverNow={() => 0} />);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });
});
