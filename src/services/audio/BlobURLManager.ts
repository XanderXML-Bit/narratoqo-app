/**
 * Centralized manager for Blob URLs to prevent memory leaks.
 * Blob URLs must be explicitly revoked when no longer needed,
 * otherwise they keep the underlying Blob data in memory.
 */
export class BlobURLManager {
  private urls = new Map<string, string>();
  private urlToId = new Map<string, string>();

  /**
   * Create a blob URL and track it for later cleanup.
   * @param blob - The blob to create a URL for
   * @param id - Optional identifier for the URL (auto-generated if not provided)
   * @returns The created blob URL
   */
  create(blob: Blob, id?: string): string {
    const url = URL.createObjectURL(blob);
    const urlId = id || url;

    // If an ID was reused, revoke the old URL first
    if (id && this.urls.has(id)) {
      const oldUrl = this.urls.get(id)!;
      URL.revokeObjectURL(oldUrl);
      this.urlToId.delete(oldUrl);
    }

    this.urls.set(urlId, url);
    this.urlToId.set(url, urlId);
    return url;
  }

  /**
   * Revoke a blob URL by its ID.
   * @param id - The identifier used when creating the URL
   */
  revoke(id: string): void {
    const url = this.urls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(id);
      this.urlToId.delete(url);
    }
  }

  /**
   * Revoke a blob URL directly.
   * @param url - The blob URL to revoke
   */
  revokeByUrl(url: string): void {
    const id = this.urlToId.get(url);
    if (id) {
      URL.revokeObjectURL(url);
      this.urls.delete(id);
      this.urlToId.delete(url);
    } else if (url.startsWith('blob:')) {
      // Revoke even if we don't track it
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Revoke all tracked blob URLs.
   */
  revokeAll(): void {
    for (const url of this.urls.values()) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
    this.urlToId.clear();
  }

  /**
   * Get the number of tracked URLs (useful for debugging).
   */
  get size(): number {
    return this.urls.size;
  }

  /**
   * Check if a URL is being tracked.
   */
  has(idOrUrl: string): boolean {
    return this.urls.has(idOrUrl) || this.urlToId.has(idOrUrl);
  }
}

// Singleton instance for application-wide blob URL management
let instance: BlobURLManager | null = null;

export function getBlobURLManager(): BlobURLManager {
  if (!instance) {
    instance = new BlobURLManager();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetBlobURLManager(): void {
  if (instance) {
    instance.revokeAll();
    instance = null;
  }
}
