import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { EventView, PartyStateResponse, PickScore, PropView } from '@shared/types';
import { LiveView } from './LiveView';
import { RostersView } from './RostersView';
import { DraftBoard } from './DraftBoard';
import { gameTag } from './PlayByPlay';
import { liveFixture } from '../lib/fixtures';
import football from '../../../server/src/game/games/riverton-vs-ironwood.json';

afterEach(cleanup);
const now = () => liveFixture.serverNow;
const drive: EventView = {
  id: 'drive-1', t: 150, type: 'drive', team: 'away', text: 'Otters take over at their own 25.', tags: [], fantasy: [],
  drive: { id: 'd04', team: 'away', yardline100: 75, halfSecondsRemaining: 675 },
};
const prop: PropView = {
  ...liveFixture.activeProp!, id: 'drive-pick', question: 'Will the Otters score on this drive?',
  resolver: { kind: 'driveResult', driveId: 'd04', outcome: 'score' },
  options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], pickCounts: { yes: 1, no: 2 },
  odds: { source: 'drive_odds', bucket: '70-79|normal', n: 100, p: { yes: 0.36, no: 0.64 } },
};
function state(): PartyStateResponse {
  const draftBoard = [football.home, football.away].flatMap((team, i) => team.roster.map((player, j) => ({
    ...liveFixture.draftBoard[0]!, player: { ...player, position: player.position as 'QB' | 'RB' | 'WR' | 'TE' | 'K' },
    side: i === 0 ? 'home' as const : 'away' as const, teamShort: team.short, points: j,
    statLine: '76 PASS YDS, 1 PASS TD',
  })));
  return {
    ...liveFixture, game: { ...liveFixture.game, sport: 'football', gameT: 150, clock: 'Q2 11:15',
      home: { ...football.home, score: 7 }, away: { ...football.away, score: 7 } },
    recentEvents: [drive], activeProp: prop, props: [prop], picks: [], draftBoard,
    standings: liveFixture.standings.map((row, i) => ({ ...row, roster: [{
      memberId: row.memberId, playerId: draftBoard[i]!.player.id, points: 7, statLine: '76 PASS YDS, 1 PASS TD',
    }] })),
  };
}
const score: PickScore = {
  propId: 'previous-pick', memberId: 'maya', optionId: 'yes', correct: true, base: 10,
  streak: 1.5, odds: 1, speed: 1.25, contrarian: 1.5, factor: 2.8125, points: 28,
  bonuses: ['lone_call', 'early_call'],
};

describe('football TV', () => {
  it('formats football event clocks at quarter boundaries and at the end of the replay', () => {
    expect(gameTag(119, 'football')).toBe('Q1 0:08');
    expect(gameTag(120, 'football')).toBe('Q2 15:00');
    // overtime game: 480 regulation + two 60-second overtimes
    expect(gameTag(479, 'football', 600, 480)).toBe('Q4 0:08');
    expect(gameTag(480, 'football', 600, 480)).toBe('OT');
    expect(gameTag(545, 'football', 600, 480)).toBe('2OT');
    expect(gameTag(480, 'football')).toBe('Q4 0:00');
    expect(gameTag(308)).toBe('Q3 0:52');
  });
  it('replaces the court with a field and labels the starting marker honestly', () => {
    const { container } = render(<LiveView state={state()} serverNow={now} />);
    expect(screen.getByRole('img', { name: /football field/i })).toBeTruthy();
    expect(container.querySelector('.tv-court')).toBeNull();
    expect(screen.getByText('Riverton Otters ball')).toBeTruthy();
    expect(screen.getByText('Drive start · own 25')).toBeTruthy();
    expect(screen.getByTestId('field-marker').getAttribute('data-yardline')).toBe('75');
    expect(screen.getAllByText('Q2 11:15').length).toBe(2);
  });

  it.each([[50, 'midfield'], [24, "opponent’s 24"], [99, 'own 1']])('formats drive starts at %s', (yardline, label) => {
    const s = state();
    s.recentEvents = [{ ...drive, drive: { ...drive.drive!, yardline100: yardline } }];
    render(<LiveView state={s} serverNow={now} />);
    expect(screen.getByText(`Drive start · ${label}`)).toBeTruthy();
  });

  it('clears the marker and possession after an end event, including turnovers typed as play', () => {
    const s = state();
    s.recentEvents = [{ ...drive, id: 'turnover', t: 170, type: 'play', driveResult: 'turnover' }, drive];
    render(<LiveView state={s} serverNow={now} />);
    expect(screen.queryByTestId('field-marker')).toBeNull();
    expect(screen.queryByText('Riverton Otters ball')).toBeNull();
    expect(screen.getByText('Drive ended · Turnover')).toBeTruthy();
  });

  it('handles missing drive context and a final game without showing possession', () => {
    const s = state();
    const { rerender } = render(<LiveView state={{ ...s, recentEvents: [] }} serverNow={now} />);
    expect(screen.getByText('Waiting for the next drive')).toBeTruthy();
    rerender(<LiveView state={{ ...s, party: { ...s.party, status: 'final' } }} serverNow={now} />);
    expect(screen.queryByTestId('field-marker')).toBeNull();
    expect(screen.getByText('Game complete')).toBeTruthy();
  });

  it('shows historical drive percentages on paired yes/no cards, using odds when options omit probability', () => {
    const { container } = render(<LiveView state={state()} serverNow={now} />);
    expect(screen.getAllByText('Historical rate')).toHaveLength(2);
    expect(screen.getByText('36%')).toBeTruthy();
    expect(screen.getByText('64%')).toBeTruthy();
    expect(container.querySelector('.tv-pick-options.is-binary')).toBeTruthy();
  });

  it('uses touchdown copy and keeps historical context on locked questions', () => {
    const s = state();
    s.activeProp = undefined;
    s.props = [{ ...prop, status: 'locked', resolver: { kind: 'driveResult', driveId: 'd04', outcome: 'td' } }];
    render(<LiveView state={s} serverNow={now} />);
    expect(screen.getAllByText('Historical rate')).toHaveLength(2);
    expect(screen.getByText('Picks locked')).toBeTruthy();
  });

  it('omits historical context for missing or invalid probabilities', () => {
    const s = state();
    s.activeProp = { ...prop, odds: undefined };
    const { rerender } = render(<LiveView state={s} serverNow={now} />);
    expect(screen.queryByText(/Drives like this/)).toBeNull();
    s.activeProp = { ...prop, odds: { ...prop.odds!, p: { yes: NaN, no: 1.5 } } };
    rerender(<LiveView state={s} serverNow={now} />);
    expect(screen.queryByText(/Drives like this/)).toBeNull();
    expect(screen.queryByText('NaN%')).toBeNull();
    expect(screen.queryByText('150%')).toBeNull();
  });

  it('shows QB position and server-formatted football stats in the leader panel', () => {
    render(<RostersView state={state()} serverNow={now} />);
    const roster = screen.getByRole('region', { name: 'Maya roster' });
    expect(roster.textContent).toContain('QB');
    expect(within(roster).getByText('76 PASS YDS, 1 PASS TD')).toBeTruthy();
  });

  it('shows football positions in draft cards', () => {
    render(<DraftBoard state={state()} />);
    const cards = screen.getAllByTestId('draft-card');
    for (const position of ['QB', 'RB', 'WR', 'TE', 'K']) {
      expect(cards.some((card) => card.textContent?.includes(`${position} ·`))).toBe(true);
    }
  });
});

describe('TV pick bonuses', () => {
  it('omits bonus panels for incorrect picks or picks without bonuses', () => {
    const s = state();
    s.lastResolvedProp = { ...prop, id: score.propId, status: 'resolved' };
    s.picks = [{ propId: score.propId, memberId: 'maya', partyId: 'party', at: 0, source: 'voice',
      optionId: 'yes', memberName: 'Maya', optionLabel: 'Yes', score: { ...score, correct: false } }];
    const { rerender } = render(<LiveView state={s} serverNow={now} />);
    expect(screen.queryByRole('region', { name: 'Last pick bonuses' })).toBeNull();
    s.picks = [{ ...s.picks[0]!, score: { ...score, bonuses: [] } }];
    rerender(<LiveView state={s} serverNow={now} />);
    expect(screen.queryByRole('region', { name: 'Last pick bonuses' })).toBeNull();
  });
  it.each(['basketball', 'football'] as const)('shows the last resolved bonuses even with an open %s pick', (sport) => {
    const s = sport === 'football' ? state() : { ...liveFixture };
    const resolved = { ...prop, id: score.propId, status: 'resolved' as const, correctOptionId: 'yes' };
    s.lastResolvedProp = resolved;
    s.picks = [{ propId: score.propId, memberId: 'maya', partyId: 'party', at: 0, source: 'voice',
      optionId: 'yes', memberName: 'Maya', optionLabel: 'Yes', score },
    { propId: 'unrelated', memberId: 'sam', partyId: 'party', at: 0, source: 'voice',
      optionId: 'yes', memberName: 'Sam', optionLabel: 'Yes', score: { ...score, correct: false } }];
    render(<LiveView state={s} serverNow={now} />);
    fireEvent.click(screen.getByText('Pick bonuses', { selector: 'summary' }));
    const bonuses = screen.getByRole('region', { name: 'Last pick bonuses' });
    expect(bonuses.textContent).toContain('Maya');
    expect(bonuses.textContent).toContain('Lone call');
    expect(bonuses.textContent).toContain('Early call');
    expect(bonuses.textContent).toContain('+28 pts');
    expect(bonuses.textContent).not.toContain('Sam');
  });

  it('shows the most recent earned bonuses beside each member in standings', () => {
    const s = state();
    s.standings = s.standings.map((row) => row.memberId === 'maya' ? { ...row, lastPickScore: score } : row);
    const { container } = render(<LiveView state={s} serverNow={now} />);
    const row = [...container.querySelectorAll('.tv-stand-row')].find((node) => node.textContent?.includes('Maya'))!;
    expect(row.textContent).toContain('Lone call');
    expect(row.textContent).toContain('+28 pts');
  });
});
