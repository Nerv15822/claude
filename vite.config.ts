import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// `base` deve coincidere con il nome del repository per GitHub Pages.
export default defineConfig({
  base: '/claude/',
  plugins: [react()],
  resolve: {
    alias: {
      '@physiology': r('./src/physiology'),
      '@scene': r('./src/scene'),
      '@ui': r('./src/ui'),
      '@pathologies': r('./src/pathologies'),
      '@store': r('./src/store'),
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
