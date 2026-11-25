import { defineConfig } from 'vitest/config';

// Security and flow tests. Each file starts its own in-memory MongoDB replica set
// (transactions need a replica set); no real database, email or AI is ever used.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
