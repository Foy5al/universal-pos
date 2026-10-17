import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages are TypeScript source; bundle them into the artifact.
  noExternal: ['@pos/contracts', '@pos/domain', '@pos/db'],
});
