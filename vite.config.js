import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'web/site',
  base: './',
  build: {
    outDir: '../../dist/site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'web/site/index.html'),
        ipLookup: resolve(import.meta.dirname, 'web/site/ip-lookup.html'),
        report: resolve(import.meta.dirname, 'web/site/report.html'),
      },
    },
  },
});
