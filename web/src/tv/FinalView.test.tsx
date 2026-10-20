import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { finalFixture, seasonFixture } from '../lib/fixtures';
import { FinalView } from './FinalView';

afterEach(cleanup);
const now = () => 0;

describe('FinalView', () => {
  it('renders podium, recap, benchwarmer and season table', () => {
    const { container, getByText } = render(<FinalView state={finalFixture} serverNow={now} season={seasonFixture} />);
    const byRank = [...finalFixture.standings].sort((a, b) => a.rank - b.rank);
    expect(container.querySelectorAll('.tv-podium-block').length).toBe(3);
    for (const place of [1, 2, 3]) {
      expect(container.querySelector(`[data-place="${place}"] .tv-podium-name`)!.textContent).toBe(byRank[place - 1]!.name);
    }
    expect(getByText('Recap')).toBeTruthy();
    expect(container.querySelector('.tv-recap blockquote')!.textContent).toBe(finalFixture.recap);
    expect(getByText('Benchwarmer of the night')).toBeTruthy();
    const bench = container.querySelector('.tv-bench-night')!.textContent!;
    expect(bench).toContain(finalFixture.benchwarmerOfTheNight!.playerName);
    expect(bench).toContain(`drafted by ${finalFixture.benchwarmerOfTheNight!.ownerName}`);
    expect(container.textContent).toContain('Season standings');
    expect(container.querySelectorAll('.tv-season-table tbody tr').length).toBe(seasonFixture.rows.length);
    expect(container.querySelector('.tv-season h3')!.textContent).toContain(seasonFixture.crew.name);
  });

  it('shows a loading placeholder without season', () => {
    const { container, getByText } = render(<FinalView state={finalFixture} serverNow={now} />);
    expect(getByText('Season standings loading…')).toBeTruthy();
    expect(container.querySelector('.tv-season-table')).toBeNull();
  });

  it('falls back when recap and benchwarmer are absent', () => {
    const state = { ...finalFixture, recap: undefined, benchwarmerOfTheNight: undefined };
    const { container } = render(<FinalView state={state} serverNow={now} />);
    const lead = [...state.standings].sort((a, b) => a.rank - b.rank)[0]!;
    expect(container.querySelector('.tv-recap blockquote')!.textContent).toContain(`${lead.name} wins the night`);
    expect(container.querySelector('.tv-bench-night')!.textContent).toContain('Ice');
  });
});
