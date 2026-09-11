import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default: logic tests need no DOM. Component tests opt in with
    // a `// @vitest-environment jsdom` docblock (requires the jsdom package).
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      // Mirrors the "@/*" path alias in tsconfig.json so tests can import
      // from lib/ and app/. Without this no test can resolve "@/lib/...".
      '@': path.resolve(__dirname, '.'),
    },
  },
});
