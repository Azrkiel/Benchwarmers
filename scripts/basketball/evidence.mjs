import fs from 'node:fs/promises';
import path from 'node:path';
import { Blocked, json } from './common.mjs';

export async function candidateEvidence(directory, game, source) {
  if (!directory) throw new Blocked('Supply --evidence-dir with reports for this exact source fingerprint.');
  const files = (await fs.readdir(directory)).filter(name => name.endsWith('.json'));
  const reports = [];
  for (const file of files) {
    const data = await json(path.join(directory, file));
    if (data.schemaVersion !== 1 || !data.kind) continue;
    if (data.game === game && data.source?.head === source.head && data.source?.fingerprint === source.fingerprint) reports.push(data);
  }
  return reports;
}
export function requireEvidence(reports, kind, checks) {
  if (!reports.some(r => r.kind === kind && r.status === 'passed' && checks.length > 0 && checks.every(check => r.checks?.some(c => c.name === check && c.status === 'passed')) && r.checks?.every(c => c.status === 'passed'))) throw new Blocked(`Missing passing ${kind} evidence for the selected game and current source.`);
}
export function requireLoadEvidence(reports, checks) {
  const qualified = reports.filter(r => r.kind === 'load' && r.metrics?.clients === 32 && r.metrics.durationMs >= 60000 && r.metrics.budgetP95Ms <= 500 && r.metrics.p95Ms <= 500 && r.metrics.errors === 0 && r.metrics.writes >= 32 && r.metrics.minimumReadsPerClient >= 2);
  requireEvidence(qualified, 'load', checks);
}
