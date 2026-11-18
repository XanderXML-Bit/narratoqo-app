import { TTSProvider } from './TTSProvider';
import { getBlobURLManager } from '../audio/BlobURLManager';

/**
 * Abstract base class for browser-based TTS providers.
 * Extends TTSProvider but doesn't require API key.
 *
 * Browser providers are:
 * - Free (zero cost)
 * - Work offline (after initial model download for Kokoro/Piper)
 * - Generate audio entirely client-side (privacy)
 */
export abstract class BrowserTTSProvider extends TTSProvider {
  constructor() {
    super(''); // No API key needed for browser providers
  }

  /**
   * Browser providers are always "configured" if supported.
   * Unlike API providers that require keys, browser providers
   * just need browser support.
   */
  isConfigured(): boolean {
    return this.isSupported();
  }

  /**
   * Browser TTS is free - always returns 0.
   */
  estimateCost(_charCount: number): number {
    return 0;
  }

  /**
   * Check if this browser provider is supported in current environment.
   * Each provider has different requirements:
   * - WebSpeech: speechSynthesis API
   * - Kokoro: WebGPU or WASM
   * - Piper: WASM
   */
  abstract isSupported(): boolean;

  /**
   * Check if model/resources are downloaded and ready.
   * - Web Speech API: Always true (uses system voices)
   * - Kokoro/Piper: True after model download
   */
  abstract isReady(): Promise<boolean>;

  /**
   * Download required models/resources.
   * @param onProgress - Callback for download progress (0-100)
   */
  abstract download(onProgress?: (progress: number) => void): Promise<void>;

  /**
   * Get download size in bytes.
   * - Web Speech API: 0 (no download needed)
   * - Kokoro: ~160MB
   * - Piper: ~50MB per language
   */
  abstract getDownloadSize(): number;

  /**
   * Helper to get audio duration from blob.
   */
  protected async getAudioDuration(blob: Blob): Promise<number> {
    return new Promise((resolve) => {
      const blobId = `duration-check-${Date.now()}`;
      const url = getBlobURLManager().create(blob, blobId);
      const audio = new Audio(url);

      audio.onloadedmetadata = () => {
        getBlobURLManager().revoke(blobId);
        resolve(audio.duration);
      };

      audio.onerror = () => {
        getBlobURLManager().revoke(blobId);
        // Fallback estimate: assume 16kHz mono audio
        resolve(blob.size / 32000);
      };
    });
  }

  /**
   * Check if browser supports WebGPU.
   */
  protected hasWebGPU(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  /**
   * Check if browser supports WebAssembly.
   */
  protected hasWASM(): boolean {
    return typeof WebAssembly !== 'undefined';
  }
}
