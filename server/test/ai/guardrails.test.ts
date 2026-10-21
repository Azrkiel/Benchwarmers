import { describe, expect, it } from 'vitest';
import { assertFamilyFriendly, checkText, sanitizeText } from '../../src/ai/guardrails.js';

describe('checkText', () => {
  it.each([
    'place a bet',
    'Bets are in',
    'betting time',
    'a wager',
    'gamble',
    'gambling',
    'the odds',
    'a parlay',
    'sportsbook',
    'money',
    'win $5',
    'win $1,000.50',
    'cash out',
    'high stake',
  ])('flags %s', (t) => {
    const r = checkText(t);
    expect(r.ok).toBe(false);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it.each(['better', 'alphabet', 'Sam picks the best player', 'cashew', 'mistake'])('does not flag %s', (t) => {
    expect(checkText(t).ok).toBe(true);
  });

  it.each(['NBA', 'wnba finals', 'NCAA', 'NFL', 'MLB', 'NHL', 'MLS', 'G League', 'EuroLeague'])(
    'flags league %s',
    (t) => {
      expect(checkText(t).ok).toBe(false);
    },
  );
});

describe('sanitizeText', () => {
  it('returns clean text unchanged', () => {
    expect(sanitizeText('Great pick!', 'fb')).toBe('Great pick!');
  });
  it('rewrites banned words', () => {
    const out = sanitizeText('Your bet beats the odds and wins $20', 'fb');
    expect(out).toBe('Your pick beats the chances and wins points');
    expect(checkText(out).ok).toBe(true);
  });
  it('preserves leading capital', () => {
    expect(sanitizeText('Betting is fun', 'fb')).toBe('Picking is fun');
  });
  it('falls back when league names remain', () => {
    expect(sanitizeText('NBA odds', 'fallback text')).toBe('fallback text');
  });
});

describe('assertFamilyFriendly', () => {
  it('throws on bad text, passes on good', () => {
    expect(() => assertFamilyFriendly('place a bet')).toThrow();
    expect(() => assertFamilyFriendly('nice pick')).not.toThrow();
  });
});
