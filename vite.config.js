import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`               → regular static site in dist/
// `vite build --mode single` → one self-contained HTML file in dist-single/
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    // Pre-bundle the depth runtime up front; discovering it on first use would
    // make the dev server reload the page and drop the loaded picture.
    optimizeDeps: { include: ['onnxruntime-web/wasm'] },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
    },
  };
});
