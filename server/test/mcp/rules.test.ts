import { describe, expect, it } from 'vitest';
import { rulesMarkdown } from '../../src/mcp/rules.js';
import { CONTRARIAN, ODDS_MULTIPLIER, PICK_FACTOR_CAP, SPEED_BUCKETS } from '../../src/shared/types.js';

describe('rulesMarkdown pick bonuses', () => {
  const md = rulesMarkdown();

  it('has a Pick bonuses section with constants-derived numbers', () => {
    expect(md).toContain('## Pick bonuses');
    for (const b of SPEED_BUCKETS) {
      expect(md).toContain(`Within the first ${Math.round(b.maxF * 100)}% of the window | ${b.factor}x`);
    }
    expect(md).toContain(`at least ${CONTRARIAN.loneMinPickers} people picking | ${CONTRARIAN.lone}x`);
    expect(md).toContain(`at least ${CONTRARIAN.minorityMinPickers} people picking | ${CONTRARIAN.minority}x`);
    expect(md).toContain(`between ${ODDS_MULTIPLIER.min}x and ${ODDS_MULTIPLIER.max}x`);
    expect(md).toContain(`capped at ${PICK_FACTOR_CAP}x combined`);
    expect(md).toContain('nearest half point');
  });

  it('keeps the live picks text and uses no wager words', () => {
    expect(md).toContain('## Live picks');
    expect(md).not.toMatch(/\b(bet|bets|betting|payout|wager)\b|odds boost/i);
  });
});
