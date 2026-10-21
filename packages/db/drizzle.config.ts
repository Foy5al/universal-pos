import { defineConfig } from 'drizzle-kit';

import { loadRootEnv } from './src/env';

loadRootEnv();

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
