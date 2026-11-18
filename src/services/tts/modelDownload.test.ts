import { describe, it, expect, beforeEach } from 'vitest';
import {
  MultiFileProgress,
  getModelDownloadState,
  reportModelProgress,
  reportModelReady,
  reportModelError,
  resetModelDownloadState,
  subscribeModelDownload,
} from './modelDownload';

describe('modelDownload store', () => {
  beforeEach(() => resetModelDownloadState());

  it('aggregates per-file progress into one byte count', () => {
    const t = new MultiFileProgress();
    t.update('config.json', 44, 44);
    expect(t.update('onnx/model_quantized.onnx', 1000, 92_361_116)).toEqual({ loaded: 1044, total: 92_361_160 });
    expect(t.update('onnx/model_quantized.onnx', 92_361_116, 92_361_116)).toEqual({ loaded: 92_361_160, total: 92_361_160 });
  });

  it('reports progress, ready and error states to subscribers', () => {
    const seen: string[] = [];
    const unsub = subscribeModelDownload(() => seen.push(getModelDownloadState().status));
    reportModelProgress('kokoro', 10, 100);
    expect(getModelDownloadState()).toMatchObject({ model: 'kokoro', status: 'downloading', loaded: 10, total: 100 });
    reportModelReady('kokoro');
    reportModelError('piper', 'offline');
    expect(getModelDownloadState()).toMatchObject({ model: 'piper', status: 'error', error: 'offline' });
    unsub();
    reportModelProgress('kokoro', 1, 2);
    expect(seen).toEqual(['downloading', 'ready', 'error']);
  });
});
