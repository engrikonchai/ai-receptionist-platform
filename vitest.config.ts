import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Playwright owns everything under e2e/ — it uses its own test
    // runner and APIs (`@playwright/test`), not Vitest's, so this
    // suite must never try to collect those files too.
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
});
