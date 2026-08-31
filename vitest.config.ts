import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['modules/**/__tests__/**/*.spec.ts', 'packages/**/*.spec.ts',
              'pipelines/**/*.spec.ts', 'platform/**/*.spec.ts', 'test/**/*.spec.ts'],
    testTimeout: 30_000, hookTimeout: 30_000,
    pool: 'forks', poolOptions: { forks: { singleFork: true } },
  },
});
