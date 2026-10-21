import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import * as tls from 'node:tls';

/** Resolve from source location, so root .env works from npm workspaces and any cwd. */
export function loadConfig(file = fileURLToPath(new URL('../../.env', import.meta.url))): void {
  try {
    loadEnvFile(file); // Native Node loader preserves values already set in the shell.
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  // Windows HTTPS inspection/proxy certificates live in the OS store, not Node's
  // bundled roots. Add the OS roots while retaining normal certificate validation.
  if (process.platform === 'win32' && typeof tls.getCACertificates === 'function' && typeof tls.setDefaultCACertificates === 'function') {
    tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
  }
}
