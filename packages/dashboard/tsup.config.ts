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
  // Every export in this package is a client component or a hook/store that
  // depends on one. Emitting the directive here means consumers on the Next.js
  // App Router can import from a server component without the whole tree
  // having to opt in to "use client" themselves.
  banner: { js: '"use client";' },
});
