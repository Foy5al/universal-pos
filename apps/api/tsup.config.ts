import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages are TypeScript source; bundle them (and their JS deps)
  // into a self-contained artifact. CJS deps like pg use dynamic require() of
  // Node builtins, which needs a real require() in the ESM output.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  noExternal: ['@pos/contracts', '@pos/domain', '@pos/db'],
});
