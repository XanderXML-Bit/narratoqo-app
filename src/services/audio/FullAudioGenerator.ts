/**
 * Full Audio Generator Service
 * Orchestrates generating full audiobook audio with smart chunking.
 * Uses provider's maximum character limit for fewer, larger chunks = better narration consistency.
 */

import { chunkTextForFullAudio, type FullAudioChunk } from '@/services/segmentation/FullAudioChunker';
import { buildWordOffsetMap } from '@/services/segmentation/SegmentTimingMapper';
import { estimateWordTiming } from './TimingEstimator';
import type { TTSProvider } from '@/services/tts/TTSProvider';
import type { TTSResult } from '@/types';
import type { GlobalTimingMap, GlobalTimingEntry, GlobalTimingWord } from './AudioExporter';

// Re-export types for convenience
export type { FullAudioChunk };

/**
 * Progress information during full audio generation.
 */
export interface FullAudioProgress {
  phase: 'chunking' | 'generating' | 'concatenating' | 'complete';
  currentChunk: number;
  totalChunks: number;
  message: string;
}

/**
 * Result from generating a single chunk.
 */
export interface GeneratedChunk {
  chunk: FullAudioChunk;
  result: TTSResult;
  globalStartTime: number;
  globalEndTime: number;
}

/**
 * Options for full audio generation.
 */
export interface FullAudioGeneratorOptions {
  projectId: string;
  text: string;
  provider: TTSProvider;
  voiceId: string;
  onProgress?: (progress: FullAudioProgress) => void;
  /** AbortSignal to cancel generation mid-way */
  signal?: AbortSignal;
}

/**
 * Result from full audio generation.
 */
export interface FullAudioGeneratorResult {
  /** Generated audio chunks with timing */
  chunks: GeneratedChunk[];
  /** Total duration of all audio */
  totalDuration: number;
  /** Global timing map for word-level highlighting */
  timingMap: GlobalTimingMap;
}

/**
 * Compute hash of text content for cache invalidation.
 */
function computeContentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Generate full audio from text using smart chunking.
 * Generates audio sequentially to preserve narration consistency.
 */
export async function generateFullAudio(
  options: FullAudioGeneratorOptions
): Promise<FullAudioGeneratorResult> {
  const { projectId, text, provider, voiceId, onProgress, signal } = options;

  // Phase 1: Chunk text using provider's maximum length
  onProgress?.({
    phase: 'chunking',
    currentChunk: 0,
    totalChunks: 0,
    message: 'Preparing text...',
  });

  const maxChunkLength = provider.maxChunkLength;
  const chunks = chunkTextForFullAudio(text, { maxChunkLength });

  if (chunks.length === 0) {
    throw new Error('No readable text to generate audio from.');
  }

  onProgress?.({
    phase: 'chunking',
    currentChunk: 0,
    totalChunks: chunks.length,
    message: `Text split into ${chunks.length} chunk${chunks.length > 1 ? 's' : ''}`,
  });

  // Phase 2: Generate audio for each chunk sequentially
  const generatedChunks: GeneratedChunk[] = [];
  let cumulativeDuration = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Check for cancellation before each chunk
    if (signal?.aborted) {
      throw new DOMException('Audio generation was cancelled.', 'AbortError');
    }

    const chunk = chunks[i];

    onProgress?.({
      phase: 'generating',
      currentChunk: i + 1,
      totalChunks: chunks.length,
      message: `Generating audio ${i + 1}/${chunks.length}...`,
    });

    // Generate audio for this chunk
    const result = await provider.synthesize({
      text: chunk.text,
      voiceId,
    });

    // Calculate global timing
    const globalStartTime = cumulativeDuration;
    const globalEndTime = cumulativeDuration + result.duration;

    generatedChunks.push({
      chunk,
      result,
      globalStartTime,
      globalEndTime,
    });

    cumulativeDuration += result.duration;
  }

  // Phase 3: Build global timing map
  onProgress?.({
    phase: 'concatenating',
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    message: 'Building timing map...',
  });

  const timingMap = buildGlobalTimingMap(projectId, text, generatedChunks);

  onProgress?.({
    phase: 'complete',
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    message: 'Generation complete!',
  });

  return {
    chunks: generatedChunks,
    totalDuration: cumulativeDuration,
    timingMap,
  };
}

/**
 * Build GlobalTimingMap from generated chunks.
 * Maps each word to its global position in the concatenated audio.
 */
function buildGlobalTimingMap(
  projectId: string,
  originalText: string,
  generatedChunks: GeneratedChunk[]
): GlobalTimingMap {
  const segments: GlobalTimingEntry[] = [];
  const chunkTimings = generatedChunks.map(({ chunk, result }) => (
    result.timing || estimateWordTiming(chunk.text, result.duration)
  ));
  // Providers need only return word times. Resolve source positions across all chunks,
  // since chunking may trim or normalize whitespace from the original text.
  const wordOffsets = buildWordOffsetMap(originalText, chunkTimings.flat());
  let wordIndex = 0;

  for (let i = 0; i < generatedChunks.length; i++) {
    const { globalStartTime, globalEndTime } = generatedChunks[i];

    // Convert chunk-local timing to global timing
    const globalWords: GlobalTimingWord[] = chunkTimings[i].map(word => {
      const offset = wordOffsets[wordIndex++];
      return {
        word: word.word,
        globalStart: globalStartTime + word.startTime,
        globalEnd: globalStartTime + word.endTime,
        charStart: offset.charStart,
        charEnd: offset.charEnd,
      };
    });

    segments.push({
      segmentIndex: i,
      globalStartTime,
      globalEndTime,
      words: globalWords,
    });
  }

  const totalDuration = generatedChunks.length > 0
    ? generatedChunks[generatedChunks.length - 1].globalEndTime
    : 0;

  return {
    projectId,
    totalDuration,
    segments,
    createdAt: new Date(),
    contentHash: computeContentHash(originalText),
  };
}

/**
 * Estimate total generation time.
 * @param text - Text to generate
 * @param maxChunkLength - Provider's max chunk length
 * @param avgSecondsPerChunk - Average API latency per chunk
 */
export function estimateFullAudioGenerationTime(
  text: string,
  maxChunkLength: number,
  avgSecondsPerChunk: number = 3
): { chunks: number; estimatedSeconds: number } {
  const chunks = chunkTextForFullAudio(text, { maxChunkLength });
  return {
    chunks: chunks.length,
    estimatedSeconds: chunks.length * avgSecondsPerChunk,
  };
}
