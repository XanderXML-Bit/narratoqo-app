import { createReadStream } from 'node:fs';
import { preview } from 'vite';

const modelDir = '../../.cache/kokoro-fixture/';
const runtimeDir = '../../node_modules/@huggingface/transformers/dist/';
const files = new Map([
  ['config.json', [modelDir, 'application/json']],
  ['tokenizer.json', [modelDir, 'application/json']],
  ['tokenizer_config.json', [modelDir, 'application/json']],
  ['onnx/model_quantized.onnx', [modelDir, 'application/octet-stream']],
  ['voices/af_heart.bin', [modelDir, 'application/octet-stream']],
  ['ort-wasm-simd-threaded.jsep.mjs', [runtimeDir, 'text/javascript']],
  ['ort-wasm-simd-threaded.jsep.wasm', [runtimeDir, 'application/wasm']],
]);

await preview({
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: [{
    name: 'kokoro-fixture',
    configurePreviewServer(server) {
      server.middlewares.use('/kokoro-fixture/', (request, response, next) => {
        const asset = request.url.slice(1);
        const fixture = files.get(asset);
        if (!fixture) {
          response.writeHead(404).end();
          return;
        }
        const [dir, contentType] = fixture;
        const stream = createReadStream(new URL(dir + asset, import.meta.url));
        response.setHeader('content-type', contentType);
        response.setHeader('access-control-allow-origin', '*');
        stream.on('error', next);
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      });
    },
  }],
});
