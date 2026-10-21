import type { Prop, PropGenContext, PropOption, ResolverSpec } from '../shared/types.js';
import { checkText } from './guardrails.js';

const OPTION_IDS: Record<ResolverSpec['kind'], { required: string[]; optional: string[] }> = {
  nextScoreType: { required: ['three', 'two', 'ft'], optional: ['other'] },
  teamScoresFirst: { required: ['home', 'away'], optional: ['none'] },
  totalPointsOver: { required: ['over', 'under'], optional: [] },
  driveResult: { required: ['yes', 'no'], optional: [] },
};

const MIN_OPEN_WINDOW = 40;
const MIN_LEAD = 20;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validateOptions(kind: ResolverSpec['kind'], raw: unknown): PropOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rule = OPTION_IDS[kind];
  const out: PropOption[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    if (!isObj(o) || typeof o.id !== 'string' || typeof o.label !== 'string') return undefined;
    if (!rule.required.includes(o.id) && !rule.optional.includes(o.id)) return undefined;
    if (seen.has(o.id)) return undefined;
    seen.add(o.id);
    const label = o.label.trim();
    if (!label || label.length > 80 || !checkText(label).ok) return undefined;
    const opt: PropOption = { id: o.id, label };
    if (o.probability !== undefined && o.probability !== null) {
      if (!num(o.probability) || o.probability < 0 || o.probability > 1) return undefined;
      opt.probability = o.probability;
    }
    out.push(opt);
  }
  if (!rule.required.every((id) => seen.has(id))) return undefined;
  const withP = out.filter((o) => o.probability !== undefined);
  if (withP.length > 0) {
    if (withP.length !== out.length) {
      for (const o of out) delete o.probability;
    } else {
      const sum = out.reduce((s, o) => s + (o.probability ?? 0), 0);
      if (Math.abs(sum - 1) > 0.05) return undefined;
    }
  }
  return out;
}

function validateResolver(raw: unknown, p: { locksAt: number; resolvesAt: number }): ResolverSpec | undefined {
  if (!isObj(raw)) return undefined;
  switch (raw.kind) {
    case 'nextScoreType':
      return num(raw.afterT) && raw.afterT === p.locksAt ? { kind: 'nextScoreType', afterT: raw.afterT } : undefined;
    case 'teamScoresFirst':
      return num(raw.afterT) && num(raw.untilT) && raw.afterT === p.locksAt && raw.untilT > raw.afterT && raw.untilT <= p.resolvesAt
        ? { kind: 'teamScoresFirst', afterT: raw.afterT, untilT: raw.untilT }
        : undefined;
    case 'totalPointsOver':
      return num(raw.atT) && num(raw.line) && raw.line > 0 && raw.atT >= p.locksAt && raw.atT <= p.resolvesAt
        ? { kind: 'totalPointsOver', atT: raw.atT, line: raw.line }
        : undefined;
    case 'driveResult':
      // Football drive props are scripted with historical odds; AI-generated ones are never accepted.
      return undefined;
    default:
      return undefined;
  }
}

/** Pure, never throws: returns only the props that satisfy every rule. */
export function validateGeneratedProps(raw: unknown, ctx: PropGenContext): Prop[] {
  if (!Array.isArray(raw)) return [];
  const accepted: Prop[] = [];
  const taken = [...ctx.existing];
  const ids = new Set(ctx.existing.map((p) => p.id));
  for (const r of raw) {
    try {
      if (!isObj(r)) continue;
      const { opensAt, locksAt, resolvesAt } = r;
      if (!num(opensAt) || !num(locksAt) || !num(resolvesAt)) continue;
      if (!(opensAt < locksAt && locksAt <= resolvesAt)) continue;
      if (locksAt - opensAt < MIN_OPEN_WINDOW) continue;
      if (opensAt < ctx.gameT + MIN_LEAD || resolvesAt > ctx.game.durationSec) continue;
      if (typeof r.id !== 'string' || !r.id.startsWith('ai-') || ids.has(r.id)) continue;
      if (r.source !== 'ai' || r.gameId !== ctx.game.id) continue;
      if (typeof r.question !== 'string') continue;
      const question = r.question.trim();
      if (!question || question.length > 200 || !checkText(question).ok) continue;
      if (!isObj(r.resolver)) continue;
      const resolver = validateResolver(r.resolver, { locksAt, resolvesAt });
      if (!resolver) continue;
      const options = validateOptions(resolver.kind, r.options);
      if (!options) continue;
      if (taken.some((e) => opensAt < e.resolvesAt && e.opensAt < resolvesAt)) continue;
      const prop: Prop = { id: r.id, gameId: ctx.game.id, question, options, opensAt, locksAt, resolvesAt, resolver, source: 'ai' };
      accepted.push(prop);
      taken.push(prop);
      ids.add(prop.id);
    } catch {
      /* drop */
    }
  }
  return accepted;
}
