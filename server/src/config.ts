import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

/** Resolve from source location, so root .env works from npm workspaces and any cwd. */
export function loadConfig(file = fileURLToPath(new URL('../../.env', import.meta.url))): void {
  try {
    loadEnvFile(file); // Native Node loader preserves values already set in the shell.
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
