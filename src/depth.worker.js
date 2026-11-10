// Runs the depth model off the main thread so the interface stays responsive.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
// More threads would need a cross-origin-isolated page, which plain static
// hosting (GitHub Pages and the like) cannot provide.
ort.env.wasm.numThreads = 1;

let session = null;

self.onmessage = async ({ data }) => {
  try {
    if (data.model) {
      session = await ort.InferenceSession.create(data.model, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    }
    if (!session) throw new Error('The depth model is not loaded');
    const input = new ort.Tensor('float32', data.pixels, [1, 3, data.height, data.width]);
    const output = await session.run({ [session.inputNames[0]]: input });
    const tensor = output[session.outputNames[0]];
    const depth = new Float32Array(tensor.data);
    const [h, w] = tensor.dims.slice(-2);
    self.postMessage({ depth, width: w, height: h }, [depth.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
