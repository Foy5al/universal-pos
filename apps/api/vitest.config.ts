import { defineConfig } from 'vitest/config';

// Integration suites run against DATABASE_URL. A remote Postgres (Neon) turns
// every fixture query into a network round trip, so the longest suite needs
// well over the 5s local default.
const remoteDatabase = Boolean(process.env.DATABASE_URL);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: remoteDatabase ? 60_000 : 5_000,
    hookTimeout: remoteDatabase ? 60_000 : 10_000,
  },
});
