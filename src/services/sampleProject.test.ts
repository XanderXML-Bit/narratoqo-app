import { describe, it, expect } from 'vitest';
import { buildSampleProject, SAMPLE_TEXT } from './sampleProject';
import { segmentText } from '@/services/segmentation';

describe('sample project', () => {
  it('builds a narratable project with the chosen voice', () => {
    const p = buildSampleProject('kokoro', 'af_heart');
    expect(p.originalContent).toBe(SAMPLE_TEXT);
    expect(p.defaultProvider).toBe('kokoro');
    expect(p.defaultVoiceId).toBe('af_heart');
    expect(p.chunks.length).toBeGreaterThan(0);
    expect(p.lastPosition).toEqual({ chunkIndex: 0, time: 0 });
  });

  it('keeps the first narrated segment short so first audio is quick', () => {
    const segments = segmentText(SAMPLE_TEXT, 'sample');
    const first = segments.find((s) => s.text.trim().length > 0)!;
    expect(first.text.length).toBeLessThan(120);
  });
});
