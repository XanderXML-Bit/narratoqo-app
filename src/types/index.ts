// TTS Provider Types
export type TTSProviderType =
  | 'openai'
  | 'elevenlabs'
  | 'playht'
  | 'deepgram'
  | 'gemini'
  | 'webspeech'  // Browser native Web Speech API
  | 'kokoro'     // WebGPU/WASM local model (high quality, English only)
  | 'piper';     // WASM multi-language

// Browser TTS capability detection
export interface BrowserTTSCapabilities {
  supportsWebGPU: boolean;
  supportsWASM: boolean;
  hasWebSpeechAPI: boolean;
  availableVoices: number;
}

export interface Voice {
  id: string;
  name: string;
  provider: TTSProviderType;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  previewUrl?: string;
}

export interface TTSOptions {
  text: string;
  voiceId: string;
  speed?: number;
  stability?: number;
  modelId?: string;
}

export interface TTSResult {
  audioBlob: Blob;
  audioUrl: string;
  duration: number;
  timing?: WordTiming[];
}

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  // Character offsets are computed by SegmentTimingMapper, not provided by TTS
  charStart?: number;
  charEnd?: number;
}

// Project Types
export interface Project {
  id: string;
  title: string;
  sourceType: 'text' | 'epub' | 'pdf' | 'url';
  originalContent: string;
  chunks: TextChunk[];
  defaultVoiceId: string;
  defaultProvider: TTSProviderType;
  lastPosition: PlaybackPosition;
  createdAt: Date;
  updatedAt: Date;
}

export interface TextChunk {
  id: string;
  index: number;
  text: string;
  type: 'narration' | 'dialogue' | 'heading';
  startOffset: number;
  endOffset: number;
}

export interface PlaybackPosition {
  chunkIndex: number;
  time: number;
}

// Audio Cache Types
export interface CachedAudio {
  id: string;
  projectId: string;
  chunkIndex: number;
  blob: Blob;
  timing?: WordTiming[];
  provider: TTSProviderType;
  voiceId: string;
  createdAt: Date;
  accessedAt: Date;
  sizeBytes: number;
}

// Player State Types
export interface PlayerState {
  isPlaying: boolean;
  currentProjectId: string | null;
  currentChunkIndex: number;
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  volume: number;
  currentWordIndex: number;
  highlightMode: 'word' | 'sentence' | 'none';
  isBuffering: boolean;
  error: string | null;
}

// Settings Types
export interface Settings {
  openRouterApiKey: string | null;
  elevenLabsApiKey: string | null;
  openAiApiKey: string | null;
  playHtApiKey: string | null;
  playHtUserId: string | null;
  deepgramApiKey: string | null;
  geminiApiKey: string | null;
  defaultProvider: TTSProviderType;
  defaultVoiceId: string;
  defaultNarratorVoice: string;
  maxCacheSizeMB: number;
  autoDeleteOldCache: boolean;
  theme: 'dark' | 'light';
}

// API Response Types
export interface OpenRouterTTSResponse {
  audio: string; // base64 encoded
  format: string;
}

// UI Types
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface ImportState {
  isImporting: boolean;
  progress: number;
  stage: 'idle' | 'parsing' | 'detecting-characters' | 'done' | 'error';
  error: string | null;
}
