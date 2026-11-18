import { getAudioCacheManager, type CacheFilter } from './AudioCacheManager';
import { getBlobURLManager } from './BlobURLManager';
import { generateFullAudio as generateFullAudioFromChunks, type GeneratedChunk, type FullAudioProgress } from './FullAudioGenerator';
import type { CachedAudio, WordTiming } from '@/types';
import type { TextSegment } from '@/services/segmentation';
import type { TTSProvider } from '@/services/tts/TTSProvider';

// Types for global timing map
export interface GlobalTimingWord {
  word: string;
  globalStart: number;
  globalEnd: number;
  charStart?: number;
  charEnd?: number;
}

export interface GlobalTimingEntry {
  segmentIndex: number;
  globalStartTime: number;
  globalEndTime: number;
  words: GlobalTimingWord[];
}

export interface GlobalTimingMap {
  projectId: string;
  totalDuration: number;
  segments: GlobalTimingEntry[];
  createdAt: Date;
  contentHash: string;
}

export interface ExportProgress {
  phase: 'loading' | 'concatenating' | 'encoding' | 'complete';
  current: number;
  total: number;
  message: string;
}

export interface ExportOptions {
  format: 'wav' | 'mp3';
  onProgress?: (progress: ExportProgress) => void;
  /** Only use cached audio made with this provider and voice. */
  cacheFilter?: CacheFilter;
  /** Cancels generation between chunks. */
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  timingMap: GlobalTimingMap;
  duration: number;
  filename: string;
}

/**
 * Check if text contains readable content (actual words).
 */
function hasReadableText(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * AudioExporter service for concatenating segment audio into a single file
 * with synchronized timing information.
 */
class AudioExporterImpl {
  private audioContext: AudioContext | null = null;

  /**
   * Export all segments as a single audio file with timing map.
   */
  async exportFullAudio(
    projectId: string,
    segments: TextSegment[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const { format = 'wav', onProgress, cacheFilter } = options;
    const cacheManager = getAudioCacheManager();

    // Filter to only readable segments
    const readableSegments = segments.filter(s => hasReadableText(s.text));

    if (readableSegments.length === 0) {
      throw new Error('No readable segments to export.');
    }

    // Phase 1: Load all cached audio
    onProgress?.({
      phase: 'loading',
      current: 0,
      total: readableSegments.length,
      message: 'Loading audio segments...',
    });

    const cachedAudios: CachedAudio[] = [];

    for (let i = 0; i < readableSegments.length; i++) {
      const segment = readableSegments[i];
      const cached = await cacheManager.get(projectId, segment.index, cacheFilter);

      if (!cached) {
        throw new Error(
          `Segment ${segment.index + 1} has no audio. Generate all segments first.`
        );
      }

      cachedAudios.push(cached);
      onProgress?.({
        phase: 'loading',
        current: i + 1,
        total: readableSegments.length,
        message: `Loading segment ${i + 1} of ${readableSegments.length}...`,
      });
    }

    // Phase 2: Decode and concatenate
    onProgress?.({
      phase: 'concatenating',
      current: 0,
      total: readableSegments.length,
      message: 'Concatenating audio...',
    });

    const { buffer, timingMap } = await this.concatenateAudio(
      projectId,
      readableSegments,
      cachedAudios,
      (current, total) => {
        onProgress?.({
          phase: 'concatenating',
          current,
          total,
          message: `Processing segment ${current} of ${total}...`,
        });
      }
    );

    // Phase 3: Encode to target format
    onProgress?.({
      phase: 'encoding',
      current: 0,
      total: 1,
      message: `Encoding ${format.toUpperCase()}...`,
    });

    const blob = await this.encodeAudio(buffer, format);

    onProgress?.({
      phase: 'complete',
      current: 1,
      total: 1,
      message: 'Export complete!',
    });

    return {
      blob,
      timingMap,
      duration: buffer.duration,
      filename: `audiobook-${projectId}.${format}`,
    };
  }

  /** Whether every readable segment already has cached audio (so nothing must be generated). */
  async hasAllSegmentAudio(projectId: string, segments: TextSegment[], cacheFilter?: CacheFilter): Promise<boolean> {
    const readable = segments.filter(s => hasReadableText(s.text));
    if (readable.length === 0) return false;
    const cacheManager = getAudioCacheManager();
    for (const segment of readable) {
      if (!(await cacheManager.get(projectId, segment.index, cacheFilter))) return false;
    }
    return true;
  }

  /**
   * Generate full audio directly from text using smart chunking.
   * Uses provider's maximum character limit for better narration consistency.
   *
   * @param projectId - Project ID for naming and caching
   * @param text - Full text to generate audio from
   * @param provider - TTS provider to use
   * @param voiceId - Voice ID for synthesis
   * @param options - Export options including format and progress callback
   * @returns ExportResult with audio blob, timing map, and duration
   */
  async generateFullAudio(
    projectId: string,
    text: string,
    provider: TTSProvider,
    voiceId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const { format = 'wav', onProgress, signal } = options;

    // Map FullAudioProgress to ExportProgress
    const progressMapper = (progress: FullAudioProgress) => {
      const phaseMap: Record<FullAudioProgress['phase'], ExportProgress['phase']> = {
        chunking: 'loading',
        generating: 'concatenating',
        concatenating: 'encoding',
        complete: 'complete',
      };

      onProgress?.({
        phase: phaseMap[progress.phase],
        current: progress.currentChunk,
        total: progress.totalChunks,
        message: progress.message,
      });
    };

    // Generate audio using smart chunking
    const result = await generateFullAudioFromChunks({
      projectId,
      text,
      provider,
      voiceId,
      onProgress: progressMapper,
      signal,
    });

    if (result.chunks.length === 0) {
      throw new Error('No audio was generated.');
    }

    // Concatenate generated chunks
    onProgress?.({
      phase: 'concatenating',
      current: 0,
      total: result.chunks.length,
      message: 'Combining audio chunks...',
    });

    const buffer = await this.concatenateGeneratedChunks(result.chunks);

    // Encode to target format
    onProgress?.({
      phase: 'encoding',
      current: 0,
      total: 1,
      message: `Encoding ${format.toUpperCase()}...`,
    });

    const blob = await this.encodeAudio(buffer, format);

    onProgress?.({
      phase: 'complete',
      current: 1,
      total: 1,
      message: 'Generation complete!',
    });

    return {
      blob,
      timingMap: result.timingMap,
      duration: buffer.duration,
      filename: `audiobook-${projectId}.${format}`,
    };
  }

  /**
   * Concatenate generated chunks into a single AudioBuffer.
   */
  private async concatenateGeneratedChunks(
    chunks: GeneratedChunk[]
  ): Promise<AudioBuffer> {
    // Create or reuse AudioContext
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }

    // Calculate total duration
    const totalDuration = chunks.reduce(
      (sum, chunk) => sum + chunk.result.duration,
      0
    );

    // Decode first chunk to get sample rate
    const firstBuffer = await this.audioContext.decodeAudioData(
      await chunks[0].result.audioBlob.arrayBuffer()
    );
    const targetSampleRate = firstBuffer.sampleRate;
    const maxChannels = firstBuffer.numberOfChannels;

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(
      maxChannels,
      Math.ceil(totalDuration * targetSampleRate),
      targetSampleRate
    );

    // Schedule each chunk's audio
    let currentTime = 0;

    for (const chunk of chunks) {
      const arrayBuffer = await chunk.result.audioBlob.arrayBuffer();
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));

      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start(currentTime);

      currentTime += buffer.duration;
    }

    // Render concatenated audio
    return await offlineContext.startRendering();
  }

  /**
   * Concatenate audio buffers and build global timing map.
   * Uses streaming approach: loads ONE buffer at a time to minimize memory usage.
   * This reduces peak memory from O(n * avgBufferSize) to O(avgBufferSize).
   */
  private async concatenateAudio(
    projectId: string,
    segments: TextSegment[],
    cachedAudios: CachedAudio[],
    onProgress: (current: number, total: number) => void
  ): Promise<{ buffer: AudioBuffer; timingMap: GlobalTimingMap }> {
    // Create or reuse AudioContext
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }

    // Pass 1: Calculate total duration and collect metadata without keeping buffers
    // This minimizes memory by not storing all decoded buffers simultaneously
    interface AudioMeta {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
    }
    const audioMeta: AudioMeta[] = [];
    let totalDuration = 0;
    let maxChannels = 1;
    let targetSampleRate = 44100;

    for (let i = 0; i < cachedAudios.length; i++) {
      const arrayBuffer = await cachedAudios[i].blob.arrayBuffer();
      const bufferCopy = arrayBuffer.slice(0);
      const audioBuffer = await this.audioContext.decodeAudioData(bufferCopy);

      audioMeta.push({
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
      });
      totalDuration += audioBuffer.duration;
      maxChannels = Math.max(maxChannels, audioBuffer.numberOfChannels);
      if (i === 0) targetSampleRate = audioBuffer.sampleRate;

      // Let GC reclaim the buffer before next iteration
      onProgress(i + 1, cachedAudios.length);
    }

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(
      maxChannels,
      Math.ceil(totalDuration * targetSampleRate),
      targetSampleRate
    );

    // Pass 2: Streaming load, decode, schedule - one buffer at a time
    // This is the key optimization: we don't keep all buffers in memory
    let currentTime = 0;
    const timingEntries: GlobalTimingEntry[] = [];

    for (let i = 0; i < cachedAudios.length; i++) {
      const segment = segments[i];
      const cached = cachedAudios[i];

      // Decode this segment's audio (one at a time)
      const arrayBuffer = await cached.blob.arrayBuffer();
      const bufferCopy = arrayBuffer.slice(0);
      const buffer = await this.audioContext.decodeAudioData(bufferCopy);

      // Schedule audio playback at the correct time
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start(currentTime);

      // Build timing entry with global offsets
      const segmentStartTime = currentTime;
      const entry: GlobalTimingEntry = {
        segmentIndex: segment.index,
        globalStartTime: segmentStartTime,
        globalEndTime: segmentStartTime + buffer.duration,
        words: (cached.timing || []).map((w: WordTiming) => ({
          word: w.word,
          globalStart: segmentStartTime + w.startTime,
          globalEnd: segmentStartTime + w.endTime,
          charStart: w.charStart,
          charEnd: w.charEnd,
        })),
      };
      timingEntries.push(entry);

      currentTime += buffer.duration;

      // Buffer is scheduled - let GC reclaim it before next iteration
      // The OfflineAudioContext keeps only the scheduled audio data
    }

    // Render concatenated audio
    const renderedBuffer = await offlineContext.startRendering();

    const timingMap: GlobalTimingMap = {
      projectId,
      totalDuration: renderedBuffer.duration,
      segments: timingEntries,
      createdAt: new Date(),
      contentHash: this.computeContentHash(segments),
    };

    return { buffer: renderedBuffer, timingMap };
  }

  /**
   * Encode AudioBuffer to Blob in specified format.
   */
  private async encodeAudio(buffer: AudioBuffer, format: 'wav' | 'mp3'): Promise<Blob> {
    if (format === 'wav') {
      // Dynamic import with error handling for audiobuffer-to-wav
      let toWav: (buffer: AudioBuffer) => ArrayBuffer;
      try {
        const module = await import('audiobuffer-to-wav');
        toWav = module.default;
      } catch (importError) {
        const message = importError instanceof Error ? importError.message : 'Unknown error';
        throw new Error(`Failed to load audio encoding library: ${message}. Please refresh and try again.`);
      }

      const wavData = toWav(buffer);
      return new Blob([wavData], { type: 'audio/wav' });
    } else {
      // MP3 encoding not yet implemented
      throw new Error('MP3 export not yet implemented. Use WAV format.');
    }
  }

  /**
   * Compute hash of segment content for invalidation detection.
   */
  private computeContentHash(segments: TextSegment[]): string {
    const content = segments.map(s => s.text).join('|');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Find segment and word at a global timestamp.
   */
  findPositionAtTime(
    timingMap: GlobalTimingMap,
    globalTime: number
  ): { segmentIndex: number; wordIndex: number; segmentLocalTime: number } | null {
    for (let s = 0; s < timingMap.segments.length; s++) {
      const entry = timingMap.segments[s];
      const isLastSegment = s === timingMap.segments.length - 1;
      // Use inclusive end for the last segment so the exact end time is matched
      const inSegment = isLastSegment
        ? globalTime >= entry.globalStartTime && globalTime <= entry.globalEndTime
        : globalTime >= entry.globalStartTime && globalTime < entry.globalEndTime;

      if (inSegment) {
        const segmentLocalTime = globalTime - entry.globalStartTime;

        // Find word index
        let wordIndex = -1;
        for (let i = 0; i < entry.words.length; i++) {
          const isLastWord = i === entry.words.length - 1;
          const inWord = isLastWord
            ? globalTime >= entry.words[i].globalStart && globalTime <= entry.words[i].globalEnd
            : globalTime >= entry.words[i].globalStart && globalTime < entry.words[i].globalEnd;
          if (inWord) {
            wordIndex = i;
            break;
          }
        }

        return {
          segmentIndex: entry.segmentIndex,
          wordIndex,
          segmentLocalTime,
        };
      }
    }
    return null;
  }

  /**
   * Get global time for a segment/word click.
   */
  getGlobalTime(
    timingMap: GlobalTimingMap,
    segmentIndex: number,
    wordIndex?: number
  ): number {
    const entry = timingMap.segments.find(e => e.segmentIndex === segmentIndex);
    if (!entry) return 0;

    if (wordIndex !== undefined && wordIndex >= 0 && entry.words[wordIndex]) {
      return entry.words[wordIndex].globalStart;
    }
    return entry.globalStartTime;
  }

  /**
   * Convert segment-relative position to global position.
   */
  segmentToGlobal(
    timingMap: GlobalTimingMap,
    segmentIndex: number,
    segmentLocalTime: number
  ): number {
    const entry = timingMap.segments.find(e => e.segmentIndex === segmentIndex);
    if (!entry) return 0;
    return entry.globalStartTime + segmentLocalTime;
  }

  /**
   * Convert global position to segment-relative position.
   */
  globalToSegment(
    timingMap: GlobalTimingMap,
    globalTime: number
  ): { segmentIndex: number; localTime: number } | null {
    const position = this.findPositionAtTime(timingMap, globalTime);
    if (!position) return null;
    return {
      segmentIndex: position.segmentIndex,
      localTime: position.segmentLocalTime,
    };
  }

  /**
   * Trigger file download.
   */
  downloadBlob(blob: Blob, filename: string): void {
    const downloadId = `download-${Date.now()}`;
    const url = getBlobURLManager().create(blob, downloadId);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    getBlobURLManager().revoke(downloadId);
  }

  /**
   * Reset the exporter (cleanup resources).
   */
  reset(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
  }
}

// Singleton instance
let instance: AudioExporterImpl | null = null;

export function getAudioExporter(): AudioExporterImpl {
  if (!instance) {
    instance = new AudioExporterImpl();
  }
  return instance;
}

export function resetAudioExporter(): void {
  if (instance) {
    instance.reset();
    instance = null;
  }
}

export type AudioExporter = AudioExporterImpl;
