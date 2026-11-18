import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PIPER_ORT_VERSION } from '@/services/tts/PiperProvider';
import { WASM_BASE as PIPER_WASM_BASE } from '@mintplex-labs/piper-tts-web';

/**
 * On-device voices load their ONNX runtime from version-pinned CDN paths.
 * If a dependency upgrade changes those versions, the CSP must follow, or
 * the free voices silently break in production (this happened before).
 */
const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const version = (pkg: string) => JSON.parse(read(`node_modules/${pkg}/package.json`)).version as string;

const headerCsp = (() => {
  const vercel = JSON.parse(read('vercel.json'));
  for (const rule of vercel.headers) {
    for (const h of rule.headers) if (h.key === 'Content-Security-Policy') return h.value as string;
  }
  throw new Error('no CSP header in vercel.json');
})();
const metaCsp = read('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];

const directive = (csp: string, name: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '))!.split(/\s+/).slice(1);

describe('Content-Security-Policy', () => {
  it('allows data: media: Howler swaps in a tiny data: WAV when it unloads a track', () => {
    for (const csp of [headerCsp, metaCsp]) expect(directive(csp, 'media-src')).toEqual(["'self'", 'blob:', 'data:']);
  });

  it('meta CSP matches the header CSP except frame-ancestors (ignored in <meta>)', () => {
    expect(metaCsp).not.toContain('frame-ancestors');
    expect(headerCsp.replace(/; frame-ancestors 'none'/, '')).toBe(metaCsp);
  });

  for (const [name, csp] of [['header', headerCsp], ['meta', metaCsp]] as const) {
    it(`${name}: allows the Kokoro model host and the installed transformers.js runtime`, () => {
      const tf = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${version('@huggingface/transformers')}/dist/`;
      expect(directive(csp, 'connect-src')).toEqual(expect.arrayContaining(['https://huggingface.co', 'https://*.hf.co', tf]));
      expect(directive(csp, 'script-src')).toContain(tf);
    });

    it(`${name}: allows the installed onnxruntime-web runtime used by Piper`, () => {
      const ortVersion = version('onnxruntime-web');
      expect(PIPER_ORT_VERSION).toBe(ortVersion);
      const ort = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`;
      expect(directive(csp, 'connect-src')).toContain(ort);
      expect(directive(csp, 'script-src')).toContain(ort);
    });

    it(`${name}: allows the piper-tts-web phonemizer WASM directory`, () => {
      const dir = PIPER_WASM_BASE.slice(0, PIPER_WASM_BASE.lastIndexOf('/') + 1);
      expect(dir).toBe('https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/');
      expect(directive(csp, 'connect-src')).toContain(dir);
    });
  }
});
