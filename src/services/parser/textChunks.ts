import { nanoid } from 'nanoid';
import type { TextChunk } from '@/types';

/**
 * Simple text parser that splits text into chunks.
 * Each chunk is approximately 3000 characters, split at sentence boundaries.
 */
export function parseTextIntoChunks(text: string): TextChunk[] {
  const MAX_CHUNK_SIZE = 3000;
  const chunks: TextChunk[] = [];

  // Split into sentences (simple approach)
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  let currentChunk = '';
  let chunkStart = 0;
  let currentOffset = 0;

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: nanoid(),
        index: chunks.length,
        text: currentChunk.trim(),
        type: 'narration',
        startOffset: chunkStart,
        endOffset: currentOffset,
      });

      chunkStart = currentOffset;
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }

    currentOffset += sentence.length;
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: nanoid(),
      index: chunks.length,
      text: currentChunk.trim(),
      type: 'narration',
      startOffset: chunkStart,
      endOffset: currentOffset,
    });
  }

  return chunks;
}
