import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [svelte({ configFile: './svelte.config.js' })],
  resolve: {
    conditions: ['browser'],
    alias: {
      '#markdown-renderer': fileURLToPath(new URL('./src/markdown/renderers/plus-entry.ts', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'jsdom',
    css: { include: [/katex/, /highlight\.js/] },
    restoreMocks: true,
    maxWorkers: 2
  }
});
