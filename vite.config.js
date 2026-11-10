import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`               → regular static site in dist/
// `vite build --mode single` → one self-contained HTML file in dist-single/
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
    },
  };
});
