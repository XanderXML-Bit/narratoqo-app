/**
 * Narratoqo TestDriver — Programmatic UI Simulation Harness
 *
 * Mirrors every user-facing action with the same preconditions the UI enforces.
 * Designed for AI sub-agents and automated QA to "use" the app without a browser.
 *
 * Usage:
 *   import { TestDriver } from '../testing/TestDriver';
 *   const app = new TestDriver();
 *   app.importBook('My Book', 'Chapter one text.\n\nChapter two text.');
 *   app.selectSegment(0);
 *   app.playAudio();
 *   app.nextSegment();
 *   app.pauseAudio();
 *   const result = app.exportAudio();
 */

import type { Project, CachedAudio, TTSProviderType, WordTiming } from '@/types';
import { segmentText, findNextReadableSegment, hasReadableText, paginateSegments, getPageForSegment, type TextSegment, type SegmentPage } from '@/services/segmentation';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class TestDriverError extends Error {
  constructor(
    message: string,
    public readonly code: TestDriverErrorCode,
  ) {
    super(message);
    this.name = 'TestDriverError';
  }
}

export type TestDriverErrorCode =
  | 'NO_PROJECT'
  | 'NO_SEGMENTS'
  | 'NO_AUDIO'
  | 'SEGMENT_NOT_FOUND'
  | 'INVALID_VALUE'
  | 'PRECONDITION_FAILED'
  | 'NOT_PLAYING'
  | 'ALREADY_PLAYING'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'EXPORT_FAILED';

// ---------------------------------------------------------------------------
// Result wrapper
// ---------------------------------------------------------------------------

export interface ActionResult<T = void> {
  ok: boolean;
  message: string;
  data: T;
}

function ok<T>(message: string, data: T): ActionResult<T> {
  return { ok: true, message, data };
}

function fail(message: string, code: TestDriverErrorCode): never {
  throw new TestDriverError(message, code);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-td-${++idCounter}`;
}

/** Reset the internal counter (useful between tests). */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ---------------------------------------------------------------------------
// Mock audio entry
// ---------------------------------------------------------------------------

function createMockCachedAudio(
  projectId: string,
  segmentIndex: number,
  provider: TTSProviderType,
  voiceId: string,
  timing?: WordTiming[],
): CachedAudio {
  return {
    id: `${projectId}-${segmentIndex}`,
    projectId,
    chunkIndex: segmentIndex,
    blob: new Blob(['mock-audio'], { type: 'audio/wav' }),
    timing,
    provider,
    voiceId,
    createdAt: new Date(),
    accessedAt: new Date(),
    sizeBytes: 1024,
  };
}

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  volume: number;
  currentWordIndex: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface TestDriverSettings {
  defaultProvider: TTSProviderType;
  defaultVoiceId: string;
  apiKeys: Partial<Record<string, string>>;
}

function defaultSettings(): TestDriverSettings {
  return {
    defaultProvider: 'webspeech',
    defaultVoiceId: 'default',
    apiKeys: {},
  };
}

// ---------------------------------------------------------------------------
// TestDriver
// ---------------------------------------------------------------------------

export class TestDriver {
  // --- State ---
  settings: TestDriverSettings;
  currentProject: Project | null = null;
  segments: TextSegment[] = [];
  pages: SegmentPage[] = [];
  currentSegmentIndex: number = 0;
  currentPage: number = 0;
  isPaginated: boolean = false;
  autoRead: boolean = false;
  viewMode: 'segmented' | 'continuous' = 'segmented';
  fullAudioMode: boolean = false;

  // Player state
  player: PlayerState = {
    isPlaying: false,
    currentTime: 0,
    totalDuration: 0,
    playbackSpeed: 1.0,
    volume: 1.0,
    currentWordIndex: -1,
  };

  // Audio cache (segment index -> CachedAudio)
  audioCache: Map<number, CachedAudio> = new Map();

  // Segment audio status
  segmentAudioStatus: Record<number, 'idle' | 'generating' | 'ready'> = {};

  // Event log for assertions
  eventLog: string[] = [];

  private static readonly SEGMENTS_PER_PAGE = 5;

  constructor(settingsOverrides?: Partial<TestDriverSettings>) {
    this.settings = { ...defaultSettings(), ...settingsOverrides };
  }

  // =========================================================================
  // Project / Import
  // =========================================================================

  /**
   * Import a book by providing title and text content directly.
   * Mirrors: Home page -> Import -> paste text -> create project
   */
  importBook(title: string, content: string): ActionResult<Project> {
    if (!title.trim()) fail('Title cannot be empty', 'INVALID_VALUE');
    if (!content.trim()) fail('Content cannot be empty', 'INVALID_VALUE');

    const project: Project = {
      id: nextId('project'),
      title: title.trim(),
      sourceType: 'text',
      originalContent: content,
      chunks: [],
      defaultVoiceId: this.settings.defaultVoiceId,
      defaultProvider: this.settings.defaultProvider,
      lastPosition: { chunkIndex: 0, time: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.currentProject = project;
    this.segments = segmentText(content, project.id);
    this.pages = paginateSegments(this.segments, TestDriver.SEGMENTS_PER_PAGE);
    this.currentSegmentIndex = 0;
    this.currentPage = 0;
    this.audioCache.clear();
    this.segmentAudioStatus = {};
    this.segments.forEach((_, i) => {
      this.segmentAudioStatus[i] = 'idle';
    });
    this.player = {
      isPlaying: false,
      currentTime: 0,
      totalDuration: 0,
      playbackSpeed: 1.0,
      volume: 1.0,
      currentWordIndex: -1,
    };
    this.fullAudioMode = false;

    this.log(`Imported book: "${title}" (${this.segments.length} segments)`);
    return ok(`Imported "${title}"`, project);
  }

  /**
   * Import a book from a URL (simulated - caller provides the parsed content).
   */
  importFromURL(url: string, parsedTitle: string, parsedContent: string): ActionResult<Project> {
    if (!url.match(/^https?:\/\//)) fail('Invalid URL protocol', 'INVALID_VALUE');
    const result = this.importBook(parsedTitle, parsedContent);
    result.data.sourceType = 'url';
    return result;
  }

  private requireProject(): Project {
    if (!this.currentProject) {
      fail('No project loaded. Import a book first.', 'NO_PROJECT');
    }
    return this.currentProject;
  }

  private requireSegments(): TextSegment[] {
    if (this.segments.length === 0) {
      fail('No segments. Import a book first.', 'NO_SEGMENTS');
    }
    return this.segments;
  }

  // =========================================================================
  // Segment Navigation
  // =========================================================================

  /**
   * Select a specific segment by index.
   * Mirrors: clicking a segment card in the Project view.
   */
  selectSegment(segmentIndex: number): ActionResult<TextSegment> {
    this.requireProject();
    const segs = this.requireSegments();

    if (segmentIndex < 0 || segmentIndex >= segs.length) {
      fail(`Segment index ${segmentIndex} out of range (0-${segs.length - 1})`, 'SEGMENT_NOT_FOUND');
    }

    // If segment is not readable, find next readable one (mirrors handleSegmentClick)
    let targetIndex = segmentIndex;
    if (!hasReadableText(segs[segmentIndex].text)) {
      const nextReadable = findNextReadableSegment(segs, segmentIndex - 1, 'forward');
      if (nextReadable === -1) {
        fail('No readable segments found', 'SEGMENT_NOT_FOUND');
      }
      targetIndex = nextReadable;
    }

    this.currentSegmentIndex = targetIndex;

    // Update page if paginated
    if (this.isPaginated) {
      const newPage = getPageForSegment(targetIndex, TestDriver.SEGMENTS_PER_PAGE);
      this.currentPage = newPage;
    }

    this.log(`Selected segment ${targetIndex}`);
    return ok(`Selected segment ${targetIndex}`, segs[targetIndex]);
  }

  /**
   * Navigate to the next readable segment.
   * Mirrors: MobilePlayer next segment button.
   */
  nextSegment(): ActionResult<TextSegment> {
    this.requireProject();
    const segs = this.requireSegments();

    const nextIdx = findNextReadableSegment(segs, this.currentSegmentIndex, 'forward');
    if (nextIdx === -1) {
      fail('No next readable segment', 'SEGMENT_NOT_FOUND');
    }

    return this.selectSegment(nextIdx);
  }

  /**
   * Navigate to the previous readable segment.
   * Mirrors: MobilePlayer previous segment button.
   */
  prevSegment(): ActionResult<TextSegment> {
    this.requireProject();
    const segs = this.requireSegments();

    const prevIdx = findNextReadableSegment(segs, this.currentSegmentIndex, 'backward');
    if (prevIdx === -1) {
      fail('No previous readable segment', 'SEGMENT_NOT_FOUND');
    }

    return this.selectSegment(prevIdx);
  }

  // =========================================================================
  // Audio Playback
  // =========================================================================

  /**
   * Generate (mock) audio for a segment. In real app this calls TTS provider.
   * Marks the segment as ready in the audio cache.
   */
  generateAudio(segmentIndex: number, timing?: WordTiming[]): ActionResult<CachedAudio> {
    const project = this.requireProject();
    const segs = this.requireSegments();

    if (segmentIndex < 0 || segmentIndex >= segs.length) {
      fail(`Segment index ${segmentIndex} out of range`, 'SEGMENT_NOT_FOUND');
    }

    if (!hasReadableText(segs[segmentIndex].text)) {
      fail(`Segment ${segmentIndex} has no readable text`, 'PRECONDITION_FAILED');
    }

    this.segmentAudioStatus[segmentIndex] = 'generating';

    const cached = createMockCachedAudio(
      project.id,
      segmentIndex,
      this.settings.defaultProvider,
      this.settings.defaultVoiceId,
      timing,
    );

    this.audioCache.set(segmentIndex, cached);
    this.segmentAudioStatus[segmentIndex] = 'ready';

    this.log(`Generated audio for segment ${segmentIndex}`);
    return ok(`Audio generated for segment ${segmentIndex}`, cached);
  }

  /**
   * Generate audio for all readable segments.
   */
  generateAllAudio(): ActionResult<number> {
    this.requireProject();
    const segs = this.requireSegments();

    let count = 0;
    for (let i = 0; i < segs.length; i++) {
      if (hasReadableText(segs[i].text)) {
        this.generateAudio(i);
        count++;
      }
    }

    this.log(`Generated audio for ${count} segments`);
    return ok(`Generated ${count} segments`, count);
  }

  /**
   * Play audio for the current segment.
   * Precondition: audio must be generated for the current segment.
   */
  playAudio(): ActionResult<void> {
    this.requireProject();

    if (this.player.isPlaying) {
      fail('Already playing', 'ALREADY_PLAYING');
    }

    const cached = this.audioCache.get(this.currentSegmentIndex);
    if (!cached) {
      fail(
        `No audio for segment ${this.currentSegmentIndex}. Call generateAudio() first.`,
        'NO_AUDIO',
      );
    }

    this.player.isPlaying = true;
    this.player.currentTime = 0;
    this.player.totalDuration = cached.timing
      ? Math.max(...cached.timing.map(w => w.endTime), 0)
      : 5.0; // Default mock duration
    this.player.currentWordIndex = cached.timing && cached.timing.length > 0 ? 0 : -1;

    this.log(`Playing segment ${this.currentSegmentIndex}`);
    return ok('Playing', undefined);
  }

  /**
   * Pause audio playback.
   */
  pauseAudio(): ActionResult<void> {
    if (!this.player.isPlaying) {
      fail('Not playing', 'NOT_PLAYING');
    }

    this.player.isPlaying = false;
    this.log(`Paused at ${this.player.currentTime.toFixed(2)}s`);
    return ok('Paused', undefined);
  }

  /**
   * Toggle play/pause.
   */
  togglePlayPause(): ActionResult<void> {
    if (this.player.isPlaying) {
      return this.pauseAudio();
    } else {
      // If no audio loaded, generate it first
      if (!this.audioCache.has(this.currentSegmentIndex)) {
        this.generateAudio(this.currentSegmentIndex);
      }
      return this.playAudio();
    }
  }

  /**
   * Seek to a specific time within the current segment.
   */
  seekTo(time: number): ActionResult<void> {
    if (this.player.totalDuration === 0) {
      fail('No audio loaded to seek', 'NO_AUDIO');
    }

    if (time < 0 || time > this.player.totalDuration) {
      fail(`Seek time ${time} out of range (0-${this.player.totalDuration})`, 'INVALID_VALUE');
    }

    this.player.currentTime = time;
    this.log(`Seeked to ${time.toFixed(2)}s`);
    return ok(`Seeked to ${time.toFixed(2)}s`, undefined);
  }

  /**
   * Seek forward by N seconds.
   */
  seekForward(seconds: number = 10): ActionResult<void> {
    const newTime = Math.min(this.player.currentTime + seconds, this.player.totalDuration);
    this.player.currentTime = newTime;
    this.log(`Seeked forward ${seconds}s`);
    return ok(`Seeked forward ${seconds}s`, undefined);
  }

  /**
   * Seek backward by N seconds.
   */
  seekBackward(seconds: number = 10): ActionResult<void> {
    const newTime = Math.max(this.player.currentTime - seconds, 0);
    this.player.currentTime = newTime;
    this.log(`Seeked backward ${seconds}s`);
    return ok(`Seeked backward ${seconds}s`, undefined);
  }

  /**
   * Simulate audio ending (auto-advance in auto-read mode).
   * Mirrors: AudioPlayer onEnd callback.
   */
  simulateAudioEnd(): ActionResult<{ advanced: boolean; nextSegment: number | null }> {
    this.player.isPlaying = false;
    this.player.currentWordIndex = -1;

    if (this.autoRead) {
      const segs = this.requireSegments();
      const nextIdx = findNextReadableSegment(segs, this.currentSegmentIndex, 'forward');

      if (nextIdx !== -1) {
        this.currentSegmentIndex = nextIdx;
        // Auto-generate and play
        if (!this.audioCache.has(nextIdx)) {
          this.generateAudio(nextIdx);
        }
        this.player.isPlaying = true;
        this.player.currentTime = 0;
        const cached = this.audioCache.get(nextIdx)!;
        this.player.totalDuration = cached.timing
          ? Math.max(...cached.timing.map(w => w.endTime), 0)
          : 5.0;

        this.log(`Auto-advanced to segment ${nextIdx}`);
        return ok('Auto-advanced', { advanced: true, nextSegment: nextIdx });
      } else {
        this.autoRead = false;
        this.log('Finished reading all segments');
        return ok('Finished all segments', { advanced: false, nextSegment: null });
      }
    }

    this.log('Audio ended');
    return ok('Audio ended', { advanced: false, nextSegment: null });
  }

  // =========================================================================
  // Playback Settings
  // =========================================================================

  /**
   * Set playback speed.
   */
  setPlaybackSpeed(speed: number): ActionResult<void> {
    if (speed < 0.5 || speed > 2.0) {
      fail('Speed must be between 0.5 and 2.0', 'INVALID_VALUE');
    }
    this.player.playbackSpeed = speed;
    this.log(`Speed set to ${speed}x`);
    return ok(`Speed: ${speed}x`, undefined);
  }

  /**
   * Set volume (0.0 to 1.0).
   */
  setVolume(volume: number): ActionResult<void> {
    if (volume < 0 || volume > 1) {
      fail('Volume must be between 0.0 and 1.0', 'INVALID_VALUE');
    }
    this.player.volume = volume;
    this.log(`Volume set to ${volume}`);
    return ok(`Volume: ${volume}`, undefined);
  }

  /**
   * Toggle mute.
   */
  toggleMute(): ActionResult<void> {
    const newVolume = this.player.volume > 0 ? 0 : 1;
    this.player.volume = newVolume;
    this.log(newVolume > 0 ? 'Unmuted' : 'Muted');
    return ok(newVolume > 0 ? 'Unmuted' : 'Muted', undefined);
  }

  /**
   * Toggle auto-read mode.
   */
  toggleAutoRead(): ActionResult<boolean> {
    this.autoRead = !this.autoRead;
    this.log(`Auto-read: ${this.autoRead ? 'ON' : 'OFF'}`);
    return ok(`Auto-read: ${this.autoRead ? 'ON' : 'OFF'}`, this.autoRead);
  }

  // =========================================================================
  // Voice / Provider
  // =========================================================================

  /**
   * Select a TTS voice.
   */
  selectVoice(voiceId: string, provider?: TTSProviderType): ActionResult<void> {
    if (!voiceId.trim()) fail('Voice ID cannot be empty', 'INVALID_VALUE');
    this.settings.defaultVoiceId = voiceId;
    if (provider) {
      this.settings.defaultProvider = provider;
    }

    // Invalidate audio cache when voice changes (mirrors provider/voice change effect)
    this.invalidateAudioCache();

    this.log(`Voice: ${voiceId} (${this.settings.defaultProvider})`);
    return ok(`Voice: ${voiceId}`, undefined);
  }

  /**
   * Invalidate all cached audio (e.g., when changing provider/voice).
   */
  private invalidateAudioCache(): void {
    this.audioCache.clear();
    for (const key of Object.keys(this.segmentAudioStatus)) {
      this.segmentAudioStatus[parseInt(key, 10)] = 'idle';
    }
  }

  // =========================================================================
  // View Mode
  // =========================================================================

  /**
   * Toggle between segmented and continuous view.
   */
  toggleViewMode(): ActionResult<'segmented' | 'continuous'> {
    this.viewMode = this.viewMode === 'segmented' ? 'continuous' : 'segmented';
    this.log(`View mode: ${this.viewMode}`);
    return ok(`View mode: ${this.viewMode}`, this.viewMode);
  }

  /**
   * Toggle pagination.
   */
  togglePagination(): ActionResult<boolean> {
    this.isPaginated = !this.isPaginated;
    this.log(`Pagination: ${this.isPaginated ? 'ON' : 'OFF'}`);
    return ok(`Pagination: ${this.isPaginated ? 'ON' : 'OFF'}`, this.isPaginated);
  }

  /**
   * Navigate to a specific page (pagination mode).
   */
  goToPage(pageIndex: number): ActionResult<SegmentPage> {
    if (!this.isPaginated) {
      fail('Pagination is not enabled', 'PRECONDITION_FAILED');
    }
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      fail(`Page ${pageIndex} out of range (0-${this.pages.length - 1})`, 'INVALID_VALUE');
    }
    this.currentPage = pageIndex;
    this.log(`Page ${pageIndex + 1} of ${this.pages.length}`);
    return ok(`Page ${pageIndex + 1}`, this.pages[pageIndex]);
  }

  /**
   * Enter full audio mode.
   */
  enterFullAudioMode(): ActionResult<void> {
    this.requireProject();
    this.fullAudioMode = true;
    this.log('Entered full audio mode');
    return ok('Full audio mode', undefined);
  }

  /**
   * Exit full audio mode.
   */
  exitFullAudioMode(): ActionResult<void> {
    this.fullAudioMode = false;
    this.log('Exited full audio mode');
    return ok('Exited full audio mode', undefined);
  }

  // =========================================================================
  // Export
  // =========================================================================

  /**
   * Export audio. Requires all readable segments to have audio generated.
   * Returns a summary of the export (in real app this would download a file).
   */
  exportAudio(format: 'wav' | 'mp3' = 'wav'): ActionResult<{
    format: string;
    segmentCount: number;
    totalSegments: number;
    missingSegments: number[];
  }> {
    this.requireProject();
    const segs = this.requireSegments();

    const readableSegments = segs.filter(s => hasReadableText(s.text));
    const missingSegments: number[] = [];

    for (const seg of readableSegments) {
      if (!this.audioCache.has(seg.index)) {
        missingSegments.push(seg.index);
      }
    }

    if (missingSegments.length > 0) {
      fail(
        `Missing audio for ${missingSegments.length} segments: [${missingSegments.slice(0, 5).join(', ')}${missingSegments.length > 5 ? '...' : ''}]`,
        'EXPORT_FAILED',
      );
    }

    if (format === 'mp3') {
      fail('MP3 export not yet implemented. Use WAV format.', 'PRECONDITION_FAILED');
    }

    const result = {
      format,
      segmentCount: readableSegments.length,
      totalSegments: segs.length,
      missingSegments: [],
    };

    this.log(`Exported ${readableSegments.length} segments as ${format}`);
    return ok('Export complete', result);
  }

  // =========================================================================
  // Snapshot / Inspection
  // =========================================================================

  /** Get current state summary for assertions. */
  snapshot(): {
    projectTitle: string | null;
    segmentCount: number;
    currentSegment: number;
    isPlaying: boolean;
    autoRead: boolean;
    viewMode: string;
    fullAudioMode: boolean;
    cachedSegments: number;
    readySegments: number;
    volume: number;
    speed: number;
  } {
    return {
      projectTitle: this.currentProject?.title ?? null,
      segmentCount: this.segments.length,
      currentSegment: this.currentSegmentIndex,
      isPlaying: this.player.isPlaying,
      autoRead: this.autoRead,
      viewMode: this.viewMode,
      fullAudioMode: this.fullAudioMode,
      cachedSegments: this.audioCache.size,
      readySegments: Object.values(this.segmentAudioStatus).filter(s => s === 'ready').length,
      volume: this.player.volume,
      speed: this.player.playbackSpeed,
    };
  }

  /** Get the text of the current segment. */
  getCurrentSegmentText(): string {
    this.requireSegments();
    return this.segments[this.currentSegmentIndex]?.text ?? '';
  }

  /** Get all segment texts. */
  getSegmentTexts(): string[] {
    return this.segments.map(s => s.text);
  }

  /** Get event log. */
  getEventLog(): string[] {
    return [...this.eventLog];
  }

  /** Clear event log. */
  clearEventLog(): void {
    this.eventLog = [];
  }

  private log(message: string): void {
    this.eventLog.push(message);
  }
}
