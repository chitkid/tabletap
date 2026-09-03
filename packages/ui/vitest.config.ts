import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The token and brand-sync tests read files off disk and want no DOM, so the default environment
// stays `node`; the component tests opt into jsdom with a `// @vitest-environment jsdom` pragma.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
