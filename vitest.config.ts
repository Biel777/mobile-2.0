import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: {
      '@rules': resolve(__dirname, './src/bff/rules'),
      '@tradetools': resolve(__dirname, './src/bff/tradetools'),
      '@data': resolve(__dirname, './src/data'),
      '@components': resolve(__dirname, './src/components'),
      '@bff': resolve(__dirname, './src/bff'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] },
});
