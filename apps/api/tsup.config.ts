import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { main: 'src/main.ts', migrate: 'src/cli/migrate.ts', seed: 'src/cli/seed.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: [/^@tabletap\//],
});
