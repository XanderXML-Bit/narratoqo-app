import { describe, it, expect } from 'vitest';
import {
  chunkTextForFullAudio,
  hasReadableContent,
  getTotalChunkLength,
  estimateGenerationTime,
  type FullAudioChunk,
} from './FullAudioChunker';

describe('hasReadableContent', () => {
  it('should return true for text with letters', () => {
    expect(hasReadableContent('Hello world')).toBe(true);
  });

  it('should return false for empty text', () => {
    expect(hasReadableContent('')).toBe(false);
  });

  it('should return false for only numbers and punctuation', () => {
    expect(hasReadableContent('123!@#')).toBe(false);
  });

  it('should return true for Unicode letters', () => {
    expect(hasReadableContent('你好')).toBe(true);
    expect(hasReadableContent('Привет')).toBe(true);
  });
});

describe('chunkTextForFullAudio', () => {
  it('should return empty array for empty text', () => {
    const chunks = chunkTextForFullAudio('', { maxChunkLength: 1000 });
    expect(chunks).toEqual([]);
  });

  it('should return empty array for non-readable text', () => {
    const chunks = chunkTextForFullAudio('123 456 789', { maxChunkLength: 1000 });
    expect(chunks).toEqual([]);
  });

  it('should return single chunk for short text', () => {
    const text = 'This is a short paragraph.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 1000 });

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].boundaryType).toBe('end');
  });

  it('should respect maxChunkLength', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 40 });

    chunks.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(40);
    });
  });

  it('should prefer paragraph boundaries', () => {
    const text = 'First paragraph with some text.\n\nSecond paragraph with more text.\n\nThird paragraph here.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 100 });

    // Should break at paragraph boundaries
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const paragraphBoundaries = chunks.filter(c => c.boundaryType === 'paragraph' || c.boundaryType === 'end');
    expect(paragraphBoundaries.length).toBeGreaterThan(0);
  });

  it('should fall back to sentence boundaries when paragraphs are too long', () => {
    const longParagraph = 'First sentence is here. Second sentence follows. Third sentence continues. Fourth sentence ends.';
    const chunks = chunkTextForFullAudio(longParagraph, { maxChunkLength: 60 });

    chunks.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(60);
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should fall back to word boundaries when sentences are too long', () => {
    const longSentence = 'This is a very long sentence without any punctuation that just keeps going and going and going';
    const chunks = chunkTextForFullAudio(longSentence, { maxChunkLength: 50 });

    chunks.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(55); // Allow slight overflow
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should assign sequential indices', () => {
    const text = 'First.\n\nSecond.\n\nThird.\n\nFourth.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 20 });

    chunks.forEach((chunk, idx) => {
      expect(chunk.index).toBe(idx);
    });
  });

  it('should track correct offsets', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 1000 });

    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBe(text.length);
  });

  it('should handle multiple chunks with correct offsets', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 30 });

    // Chunks should not overlap
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startOffset).toBeGreaterThanOrEqual(chunks[i - 1].endOffset);
    }
  });

  it('should normalize line endings', () => {
    const text = 'First.\r\n\r\nSecond.';
    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 1000 });

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe('First.\n\nSecond.');
  });

  it('should merge tiny trailing chunks', () => {
    const text = 'A longer first sentence here. X';
    const chunks = chunkTextForFullAudio(text, {
      maxChunkLength: 35,
      minChunkLength: 5
    });

    // The 'X' should be merged with the previous chunk
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.text).toContain('X');
  });

  it('should handle real-world text example', () => {
    const text = `Chapter 1: The Beginning

It was a dark and stormy night. The wind howled through the trees, rattling the windows of the old mansion. Inside, Sarah sat by the fire, reading a worn leather-bound book.

"Who's there?" she called out, hearing footsteps in the hallway.

No one answered. The silence was deafening.`;

    const chunks = chunkTextForFullAudio(text, { maxChunkLength: 200 });

    // Should create reasonable chunks
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    chunks.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
      expect(hasReadableContent(chunk.text)).toBe(true);
    });
  });

  it('should handle provider max lengths correctly', () => {
    // Simulate different provider limits
    const providerLimits = [
      { name: 'Deepgram', limit: 2000 },
      { name: 'OpenAI', limit: 4096 },
      { name: 'ElevenLabs', limit: 5000 },
      { name: 'Gemini', limit: 8000 },
    ];

    const longText = 'This is a sentence. '.repeat(100);

    providerLimits.forEach(({ limit }) => {
      const chunks = chunkTextForFullAudio(longText, { maxChunkLength: limit });

      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(limit);
      });
    });
  });
});

  it('should handle 100k+ character text efficiently', () => {
    // Generate ~120k characters of realistic text
    const paragraph = 'The quick brown fox jumps over the lazy dog. This is a test sentence with reasonable length. ';
    const longText = (paragraph.repeat(200) + '\n\n').repeat(7); // ~126k chars

    const start = performance.now();
    const chunks = chunkTextForFullAudio(longText, { maxChunkLength: 4096 });
    const elapsed = performance.now() - start;

    // Should complete in under 500ms even for large text
    expect(elapsed).toBeLessThan(500);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(4096);
    });
  });

  it('should handle text with no whitespace by hard-cutting at maxChunkLength', () => {
    const noSpaces = 'a'.repeat(200);
    const chunks = chunkTextForFullAudio(noSpaces, { maxChunkLength: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.text.length).toBeLessThanOrEqual(50);
    });
  });

describe('getTotalChunkLength', () => {
  it('should return 0 for empty array', () => {
    expect(getTotalChunkLength([])).toBe(0);
  });

  it('should sum all chunk lengths', () => {
    const chunks: FullAudioChunk[] = [
      { index: 0, text: 'Hello', startOffset: 0, endOffset: 5, boundaryType: 'paragraph' },
      { index: 1, text: 'World', startOffset: 6, endOffset: 11, boundaryType: 'end' },
    ];

    expect(getTotalChunkLength(chunks)).toBe(10);
  });
});

describe('estimateGenerationTime', () => {
  it('should estimate time based on chunk count', () => {
    expect(estimateGenerationTime(5)).toBe(15); // 5 * 3 seconds default
    expect(estimateGenerationTime(5, 2)).toBe(10); // 5 * 2 seconds custom
  });

  it('should return 0 for 0 chunks', () => {
    expect(estimateGenerationTime(0)).toBe(0);
  });
});
