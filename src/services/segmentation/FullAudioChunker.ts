/**
 * Smart text chunking for Full Audio Mode.
 * Chunks text at natural paragraph/sentence boundaries using provider's maximum limit.
 * This gives better narration consistency than the 500-char segments used for per-segment playback.
 */

export interface FullAudioChunk {
  /** Chunk index (0-based) */
  index: number;
  /** Text content of this chunk */
  text: string;
  /** Character offset where this chunk starts in original text */
  startOffset: number;
  /** Character offset where this chunk ends in original text */
  endOffset: number;
  /** Type of boundary used to end this chunk */
  boundaryType: 'paragraph' | 'sentence' | 'word' | 'end';
}

export interface ChunkingOptions {
  /** Maximum characters per chunk (from TTS provider's limit) */
  maxChunkLength: number;
  /** Minimum characters to avoid tiny trailing chunks (default: 100) */
  minChunkLength?: number;
}

/**
 * Check if text contains readable content.
 */
export function hasReadableContent(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * Find the last paragraph boundary before maxPosition.
 * Paragraph boundaries are double newlines.
 * Returns -1 if no boundary found.
 */
function findParagraphBoundary(text: string, maxPosition: number): number {
  // Look for double newline (paragraph break) before maxPosition
  const paragraphPattern = /\n\s*\n/g;
  let lastMatch = -1;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(text)) !== null) {
    const endOfBreak = match.index + match[0].length;
    if (endOfBreak <= maxPosition) {
      lastMatch = endOfBreak;
    } else {
      break;
    }
  }

  return lastMatch;
}

/**
 * Find the last sentence boundary before maxPosition.
 * Sentence boundaries are .!? followed by whitespace.
 * Returns -1 if no boundary found.
 */
function findSentenceBoundary(text: string, maxPosition: number): number {
  // Look for sentence-ending punctuation followed by whitespace
  const sentencePattern = /[.!?]+[\s]+/g;
  let lastMatch = -1;
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(text)) !== null) {
    const endOfSentence = match.index + match[0].length;
    if (endOfSentence <= maxPosition) {
      lastMatch = endOfSentence;
    } else {
      break;
    }
  }

  return lastMatch;
}

/**
 * Find the last word boundary before maxPosition.
 * Word boundaries are whitespace.
 * Returns -1 if no boundary found.
 */
function findWordBoundary(text: string, maxPosition: number): number {
  // Search backwards from maxPosition for whitespace - much faster for large text
  const limit = Math.min(maxPosition, text.length);
  for (let i = limit - 1; i >= 0; i--) {
    const ch = text.charCodeAt(i);
    // Check for common whitespace: space, tab, newline, carriage return
    if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
      return i + 1; // Position after the whitespace
    }
  }

  return -1;
}

/**
 * Chunk text for Full Audio Mode using provider's maximum character limit.
 * Prefers breaking at natural boundaries (paragraphs > sentences > words).
 *
 * @param text - The full text to chunk
 * @param options - Chunking options including maxChunkLength
 * @returns Array of chunks with text and offset information
 */
export function chunkTextForFullAudio(
  text: string,
  options: ChunkingOptions
): FullAudioChunk[] {
  const { maxChunkLength, minChunkLength = 100 } = options;

  if (!text || !hasReadableContent(text)) {
    return [];
  }

  // Normalize whitespace but preserve paragraph breaks
  const normalizedText = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();

  // If text fits in one chunk, return as-is
  if (normalizedText.length <= maxChunkLength) {
    return [{
      index: 0,
      text: normalizedText,
      startOffset: 0,
      endOffset: normalizedText.length,
      boundaryType: 'end',
    }];
  }

  const chunks: FullAudioChunk[] = [];
  let currentPosition = 0;

  while (currentPosition < normalizedText.length) {
    const remainingText = normalizedText.slice(currentPosition);
    const remainingLength = remainingText.length;

    // If remaining text fits in max length, take it all
    if (remainingLength <= maxChunkLength) {
      chunks.push({
        index: chunks.length,
        text: remainingText.trim(),
        startOffset: currentPosition,
        endOffset: normalizedText.length,
        boundaryType: 'end',
      });
      break;
    }

    // Try to find a good break point within maxChunkLength
    let breakPoint = -1;
    let boundaryType: FullAudioChunk['boundaryType'] = 'word';

    // Priority 1: Paragraph boundary (best for narration consistency)
    breakPoint = findParagraphBoundary(remainingText, maxChunkLength);
    if (breakPoint > minChunkLength) {
      boundaryType = 'paragraph';
    }

    // Priority 2: Sentence boundary
    if (breakPoint === -1 || breakPoint < minChunkLength) {
      const sentenceBreak = findSentenceBoundary(remainingText, maxChunkLength);
      if (sentenceBreak > minChunkLength) {
        breakPoint = sentenceBreak;
        boundaryType = 'sentence';
      }
    }

    // Priority 3: Word boundary (fallback)
    if (breakPoint === -1 || breakPoint < minChunkLength) {
      const wordBreak = findWordBoundary(remainingText, maxChunkLength);
      if (wordBreak > 0) {
        breakPoint = wordBreak;
        boundaryType = 'word';
      } else {
        // Absolute fallback: hard cut at maxChunkLength
        breakPoint = maxChunkLength;
        boundaryType = 'word';
      }
    }

    // Extract the chunk
    const chunkText = remainingText.slice(0, breakPoint).trim();

    if (chunkText.length > 0 && hasReadableContent(chunkText)) {
      chunks.push({
        index: chunks.length,
        text: chunkText,
        startOffset: currentPosition,
        endOffset: currentPosition + breakPoint,
        boundaryType,
      });
    }

    currentPosition += breakPoint;

    // Skip any leading whitespace for next chunk
    while (currentPosition < normalizedText.length && /\s/.test(normalizedText[currentPosition])) {
      currentPosition++;
    }
  }

  // Handle tiny trailing chunk: merge with previous if too small
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.text.length < minChunkLength) {
      const prevChunk = chunks[chunks.length - 2];
      // Only merge if combined length is still reasonable
      if (prevChunk.text.length + lastChunk.text.length <= maxChunkLength * 1.1) {
        prevChunk.text = prevChunk.text + ' ' + lastChunk.text;
        prevChunk.endOffset = lastChunk.endOffset;
        prevChunk.boundaryType = lastChunk.boundaryType;
        chunks.pop();
      }
    }
  }

  return chunks;
}

/**
 * Get the total character count of all chunks.
 */
export function getTotalChunkLength(chunks: FullAudioChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
}

/**
 * Estimate generation time based on chunk count and average TTS latency.
 * @param chunkCount - Number of chunks to generate
 * @param avgSecondsPerChunk - Average time per TTS API call (default: 3s)
 */
export function estimateGenerationTime(
  chunkCount: number,
  avgSecondsPerChunk: number = 3
): number {
  return chunkCount * avgSecondsPerChunk;
}
