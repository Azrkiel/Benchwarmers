import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createRef } from 'react';
import { liveFixture, draftingFixture, finalFixture } from '../lib/fixtures';
import { DraftBoard } from './DraftBoard';
import { DraftBoard as BroadcastDraft } from '../tv-broadcast/DraftBoard';
import { PickBar } from './PickBar';
import { PickBar as BroadcastPick } from '../tv-broadcast/PickBar';
import { Scoreboard } from './Scoreboard';
import { Scoreboard as BroadcastScoreboard } from '../tv-broadcast/Scoreboard';
import { GameOverview } from '../tv-broadcast/GameOverview';
import { ViewNav } from '../tv-broadcast/ViewNav';
import { Seats } from '../lounge/LoungeElements';
import { Picks, RosterDialog } from '../lounge/LoungeViews';
import { useTvMode } from './modes';
import { FinalView } from './FinalView';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const now = () => liveFixture.serverNow;

describe('ESPN-informed shared-screen behavior', () => {
  for (const Board of [DraftBoard, BroadcastDraft]) {
    it(`${Board === DraftBoard ? 'original' : 'broadcast'} draft keeps one player identity and explicit ownership`, () => {
      render(<Board state={draftingFixture} />);
      expect(screen.getByText('Still drafting')).toBeTruthy();
      expect(screen.getAllByText('Big Mo')).toHaveLength(1);
      expect(screen.getAllByText(/Drafted by Maya/).length).toBeGreaterThan(0);
      expect(screen.queryByText('On the clock')).toBeNull();
    });
  }
  for (const Bar of [PickBar, BroadcastPick]) {
    it(`${Bar === PickBar ? 'original' : 'broadcast'} pick separates counts from unavailable rates and retains resolved choices`, () => {
      const prop = { ...liveFixture.activeProp!, options: liveFixture.activeProp!.options.map(o => ({ ...o, probability: undefined })), odds: undefined };
      const { container, rerender } = render(<Bar state={{ ...liveFixture, activeProp: prop }} serverNow={now} />);
      expect(screen.getByText('Open pick')).toBeTruthy();
      expect(screen.getByText('Closes in')).toBeTruthy();
      expect(screen.getAllByText('Not available').length).toBe(prop.options.length);
      expect(container.querySelector('.tv-pick-bar')).toBeNull();
      expect(screen.getAllByText(/\/4 picks/).length).toBe(prop.options.length);
      const result = { ...prop, status: 'resolved' as const, correctOptionId: prop.options[0]!.id };
      rerender(<Bar state={{ ...liveFixture, activeProp: undefined, props: [], lastResolvedProp: result }} serverNow={now} />);
      expect(screen.getByText('Result')).toBeTruthy();
      for (const option of prop.options) expect(screen.getByText(option.label)).toBeTruthy();
      expect(screen.getByText('Correct answer')).toBeTruthy();
    });
  }
  for (const Board of [Scoreboard, BroadcastScoreboard]) {
    it(`${Board === Scoreboard ? 'original' : 'broadcast'} scoreboard derives pregame phase`, () => {
      render(<Board state={draftingFixture} />);
      expect(screen.getByText('Pregame')).toBeTruthy();
      expect(screen.queryByText('Live')).toBeNull();
    });
  }
  it('keeps the chosen TV screen stable unless automatic rotation is enabled', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTvMode(liveFixture));
    act(() => { vi.advanceTimersByTime(21_000); });
    expect(result.current).toBe('live');
  });
  it('shows answer options in overview even when a details action is available', () => {
    render(<GameOverview state={liveFixture} onNavigate={vi.fn()} />);
    for (const option of liveFixture.activeProp!.options) expect(screen.getByText(option.label)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Standings' })).toBeTruthy();
    expect(screen.getByText(/Make a pick on your device/)).toBeTruthy();
  });
  it('does not consume arrows typed into an unrelated control', () => {
    render(<><ViewNav views={[{ mode: 'live', label: 'Game' }]} mode="live" manual={false} onSelect={vi.fn()} onClose={vi.fn()} contentRef={createRef()} /><input aria-label="Find player" /></>);
    const input = screen.getByRole('textbox'); input.focus();
    expect(fireEvent.keyDown(input, { key: 'ArrowLeft' })).toBe(true);
    expect(document.activeElement).toBe(input);
  });
  it('preserves full participant names in the compact standings', () => {
    const name = 'Alexandria Montgomery';
    render(<Seats state={{ ...liveFixture, standings: [{ ...liveFixture.standings[0]!, name }] }} onMember={vi.fn()} />);
    expect(screen.getByText(name)).toBeTruthy();
  });
  it('labels sourced historical rates without claiming a model estimate', () => {
    const prop = { ...liveFixture.activeProp!, odds: { ...liveFixture.activeProp!.odds, source: 'drive_odds' as const, bucket: 'test', n: 100, p: { yes: 0.6, no: 0.4 } } };
    render(<Picks state={{ ...liveFixture, activeProp: prop }} now={now()} />);
    expect(screen.getAllByText(/Historical rate/).length).toBeGreaterThan(0);
    expect(screen.getByText('60% · Historical rate')).toBeTruthy();
    expect(screen.getByText('40% · Historical rate')).toBeTruthy();
    expect(screen.queryByText(/model estimate/)).toBeNull();
  });
  it('makes roster reading a focusable region', () => {
    render(<RosterDialog memberId={liveFixture.standings[0]!.memberId} state={liveFixture} onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Roster players' }).tabIndex).toBe(0);
  });
  it('provides an in-panel season retry without confetti', () => {
    const retry = vi.fn();
    const { container } = render(<FinalView state={finalFixture} serverNow={now} seasonError onRetrySeason={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry season standings' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(container.querySelector('.tv-confetti')).toBeNull();
  });
});

