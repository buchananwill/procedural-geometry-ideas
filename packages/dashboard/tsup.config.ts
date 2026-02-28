import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: [
    'react', 'react-dom',
    '@mantine/core', '@mantine/hooks',
    'konva', 'react-konva',
    'zustand', 'zustand/middleware/immer',
    'immer',
    '@proc-geo/core',
    '@proc-geo/test-fixtures',
  ],
  sourcemap: true,
  jsx: 'automatic',
});
