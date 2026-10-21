export interface GuardrailResult {
  ok: boolean;
  reasons: string[];
}

const DOLLAR_RE = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars?|bucks)\b/gi;

const GAMBLING_RULES: Array<{ label: string; re: RegExp }> = [
  { label: 'gambling language: bet', re: /\b(?:bet|bets|betting|bettor|bettors)\b/i },
  { label: 'gambling language: wager', re: /\bwager(?:s|ed|ing)?\b/i },
  { label: 'gambling language: gamble', re: /\bgambl(?:e|es|ed|er|ers|ing)\b/i },
  { label: 'gambling language: odds', re: /\bodds\b/i },
  { label: 'gambling language: parlay', re: /\bparlays?\b/i },
  { label: 'gambling language: sportsbook', re: /\bsportsbooks?\b/i },
  { label: 'money language: money', re: /\bmoney\b/i },
  { label: 'money language: cash', re: /\bcash\b/i },
  { label: 'gambling language: stake', re: /\bstakes?\b/i },
  { label: 'money language: dollar amount', re: new RegExp(DOLLAR_RE.source, 'i') },
];

const LEAGUE_RULES: Array<{ label: string; re: RegExp }> = [
  { label: 'real league: NBA', re: /\bNBA\b/i },
  { label: 'real league: WNBA', re: /\bWNBA\b/i },
  { label: 'real league: NCAA', re: /\bNCAA\b/i },
  { label: 'real league: NFL', re: /\bNFL\b/i },
  { label: 'real league: MLB', re: /\bMLB\b/i },
  { label: 'real league: NHL', re: /\bNHL\b/i },
  { label: 'real league: MLS', re: /\bMLS\b/i },
  { label: 'real league: G League', re: /\bG[\s-]?League\b/i },
  { label: 'real league: EuroLeague', re: /\bEuro[\s-]?League\b/i },
  { label: 'real league: Premier League', re: /\bPremier League\b/i },
  { label: 'real league: La Liga', re: /\bLa Liga\b/i },
  { label: 'real league: Bundesliga', re: /\bBundesliga\b/i },
  { label: 'real league: Serie A', re: /\bSerie A\b/i },
  { label: 'real league: UEFA', re: /\bUEFA\b/i },
  { label: 'real league: FIBA', re: /\bFIBA\b/i },
  { label: 'real league: Champions League', re: /\bChampions League\b/i },
  { label: 'real league: NASCAR', re: /\bNASCAR\b/i },
];

export function checkText(text: string): GuardrailResult {
  const reasons: string[] = [];
  for (const rule of [...GAMBLING_RULES, ...LEAGUE_RULES]) {
    if (rule.re.test(text)) reasons.push(rule.label);
  }
  return { ok: reasons.length === 0, reasons };
}

const REWRITES: Array<[RegExp, string]> = [
  [DOLLAR_RE, 'points'],
  [/\bbetting\b/gi, 'picking'],
  [/\b(?:bets|bettors)\b/gi, 'picks'],
  [/\b(?:bet|bettor)\b/gi, 'pick'],
  [/\bwager(?:s|ed|ing)?\b/gi, 'pick'],
  [/\bgambl(?:e|es|ed|er|ers|ing)\b/gi, 'guess'],
  [/\bodds\b/gi, 'chances'],
  [/\bparlays?\b/gi, 'combo'],
  [/\bsportsbooks?\b/gi, 'scoreboard'],
  [/\bmoney\b/gi, 'points'],
  [/\bcash\b/gi, 'points'],
  [/\bstakes?\b/gi, 'points'],
];

function matchCase(from: string, to: string): string {
  if (from.length > 1 && from === from.toUpperCase() && /[A-Z]/.test(from)) return to.toUpperCase();
  const first = from[0];
  if (first && first !== first.toLowerCase()) return to.charAt(0).toUpperCase() + to.slice(1);
  return to;
}

export function rewriteText(text: string): string {
  let out = text;
  for (const [re, to] of REWRITES) out = out.replace(re, (m) => matchCase(m, to));
  return out;
}

/** Returns text if clean; else a rewritten version if that is clean; else fallback. */
export function sanitizeText(text: string, fallback: string): string {
  if (checkText(text).ok) return text;
  const rewritten = rewriteText(text);
  return checkText(rewritten).ok ? rewritten : fallback;
}

export function assertFamilyFriendly(text: string): void {
  const r = checkText(text);
  if (!r.ok) throw new Error(`Text failed family-friendly check: ${r.reasons.join('; ')}`);
}
