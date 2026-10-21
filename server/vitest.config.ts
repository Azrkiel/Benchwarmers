import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    // Each MCP/API test file runs its own HTTP server; ~15 parallel workers on a 16-core box push the <500 ms tool-latency
    // assertions over budget (CPU contention, not slow code: setup_watch_party is ~50 ms on a quiet server).
    maxWorkers: 6,
  },
});
