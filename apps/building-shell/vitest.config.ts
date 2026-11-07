import {defineConfig, mergeConfig} from 'vitest/config';
import viteConfig from './vite.config';

// The vite config's `@proc-geo/core` source alias applies to every test.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
