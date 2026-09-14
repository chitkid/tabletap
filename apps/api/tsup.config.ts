import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { main: 'src/main.ts', migrate: 'src/cli/migrate.ts', seed: 'src/cli/seed.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: false,
  // `public/` lands beside the bundle in `dist/`, which is what the runtime image copies. The QR
  // sheet's brand TTFs live there: pdfkit reads them off disk at render time, so they have to be
  // real files next to `main.js` rather than anything a bundler could inline. See `lib/qr-pdf.ts`.
  publicDir: true,
  noExternal: [/^@tabletap\//],
});
