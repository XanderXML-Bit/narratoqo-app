import type { TTSProviderType, TTSOptions, TTSResult, Voice } from '@/types';
import { getBlobURLManager } from '@/services/audio/BlobURLManager';

/**
 * Abstract base class for TTS providers.
 * All TTS provider implementations must extend this class.
 */
export abstract class TTSProvider {
  abstract readonly providerType: TTSProviderType;
  abstract readonly providerName: string;
  abstract readonly supportsWordTiming: boolean;
  abstract readonly maxChunkLength: number;
  abstract readonly supportsStreaming: boolean;

  // Track URLs created by this provider for cleanup
  private createdUrls: string[] = [];

  constructor(protected apiKey: string) {}

  /**
   * Generate speech from text.
   * @param options - TTS generation options
   * @returns Promise resolving to audio blob, URL, duration, and optional word timing
   */
  abstract synthesize(options: TTSOptions): Promise<TTSResult>;

  /**
   * Get available voices for this provider.
   * @returns Promise resolving to array of available voices
   */
  abstract getVoices(): Promise<Voice[]>;

  /**
   * Estimate cost for generating speech.
   * @param charCount - Number of characters to synthesize
   * @returns Estimated cost in USD
   */
  abstract estimateCost(charCount: number): number;

  /**
   * Check if the provider is properly configured.
   * @returns true if API key is set and valid
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Validate that TTS options contain non-empty text.
   * Call at the start of synthesize() to avoid wasted API calls.
   * @throws TTSError if text is empty or whitespace-only
   */
  protected validateText(options: TTSOptions): void {
    if (!options.text || options.text.trim().length === 0) {
      throw new TTSError('Cannot synthesize empty text', this.providerType, 'EMPTY_TEXT');
    }
  }

  /**
   * Create an object URL from an audio blob.
   * URLs are tracked for cleanup when dispose() is called.
   * @param blob - Audio blob
   * @returns Object URL for playback
   */
  protected createAudioUrl(blob: Blob): string {
    const manager = getBlobURLManager();
    const url = manager.create(blob);
    this.createdUrls.push(url);
    return url;
  }

  /**
   * Clean up all blob URLs created by this provider.
   * Call this when the provider is no longer needed.
   */
  dispose(): void {
    const manager = getBlobURLManager();
    for (const url of this.createdUrls) {
      manager.revokeByUrl(url);
    }
    this.createdUrls = [];
  }

  /**
   * Revoke a specific URL created by this provider.
   * Call this after audio playback is complete.
   */
  revokeUrl(url: string): void {
    const manager = getBlobURLManager();
    manager.revokeByUrl(url);
    const index = this.createdUrls.indexOf(url);
    if (index !== -1) {
      this.createdUrls.splice(index, 1);
    }
  }

  /**
   * Convert base64 audio to blob.
   * @param base64 - Base64 encoded audio
   * @param mimeType - MIME type of the audio
   * @returns Audio blob
   */
  protected base64ToBlob(base64: string, mimeType: string = 'audio/mpeg'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Estimate audio duration from blob size.
   * Rough estimate assuming MP3 at 128kbps.
   * @param blob - Audio blob
   * @returns Estimated duration in seconds
   */
  protected estimateDuration(blob: Blob): number {
    // MP3 at 128kbps = 16000 bytes per second
    return blob.size / 16000;
  }
}

/**
 * Error thrown when TTS generation fails.
 */
export class TTSError extends Error {
  constructor(
    message: string,
    public readonly provider: TTSProviderType,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'TTSError';
  }
}
