import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { liveFixture } from '../lib/fixtures';
import { RostersView } from './RostersView';
import { worstPerformer } from './rosters';

afterEach(cleanup);

describe('RostersView', () => {
  it('renders 4 members, 12 players and one benchwarmer tag in the worst owner column', () => {
    const { container, getByText } = render(<RostersView state={liveFixture} serverNow={() => 0} />);
    expect(getByText('Rosters')).toBeTruthy();
    for (const s of liveFixture.standings) expect(getByText(s.name)).toBeTruthy();
    expect(container.querySelectorAll('.tv-roster-player').length).toBe(12);
    const tags = container.querySelectorAll('.tv-benchwarmer-tag');
    expect(tags.length).toBe(1);
    expect(tags[0]!.textContent).toContain('Benchwarmer');
    expect(tags[0]!.textContent).toContain('🪑');
    const w = worstPerformer(liveFixture)!;
    expect(tags[0]!.closest('.tv-roster-col')!.getAttribute('data-member')).toBe(w.memberId);
    expect(tags[0]!.closest('.tv-roster-player')!.getAttribute('data-player')).toBe(w.playerId);
  });
});
