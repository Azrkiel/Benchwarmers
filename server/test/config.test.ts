import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const dirs: string[] = [];
const original = process.env.BW_CONFIG_TEST;
const systemCaSupported = typeof tls.getCACertificates === 'function' && typeof tls.setDefaultCACertificates === 'function';
const originalRoots = systemCaSupported ? tls.getCACertificates('default') : [];
afterEach(() => {
  if (systemCaSupported) tls.setDefaultCACertificates(originalRoots);
  if (original === undefined) delete process.env.BW_CONFIG_TEST;
  else process.env.BW_CONFIG_TEST = original;
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('server environment', () => {
  it.skipIf(process.platform !== 'win32' || !systemCaSupported)('trusts Windows-installed CAs while retaining the default trust roots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-config-'));
    dirs.push(dir);
    loadConfig(path.join(dir, 'missing.env'));
    // Node normalizes PEM formatting when setting roots; compare certificate identities.
    const fingerprint = (cert: string) => new X509Certificate(cert).fingerprint256;
    const roots = new Set(tls.getCACertificates('default').map(fingerprint));
    expect(originalRoots.every((cert) => roots.has(fingerprint(cert)))).toBe(true);
    expect(tls.getCACertificates('system').every((cert) => roots.has(fingerprint(cert)))).toBe(true);
  });

  it('loads an env file and preserves shell overrides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-config-'));
    dirs.push(dir);
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, 'BW_CONFIG_TEST=from-file\n');
    delete process.env.BW_CONFIG_TEST;
    loadConfig(file);
    expect(process.env.BW_CONFIG_TEST).toBe('from-file');
    process.env.BW_CONFIG_TEST = 'from-shell';
    loadConfig(file);
    expect(process.env.BW_CONFIG_TEST).toBe('from-shell');
  });

  it('allows an absent env file but reports other filesystem errors', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-config-'));
    dirs.push(dir);
    expect(() => loadConfig(path.join(dir, 'missing.env'))).not.toThrow();
    expect(() => loadConfig(dir)).toThrow();
  });
});
