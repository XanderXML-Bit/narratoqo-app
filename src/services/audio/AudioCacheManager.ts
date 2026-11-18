import { db } from '@/db/schema';
import type { CachedAudio, TTSProviderType } from '@/types';

export interface CacheFilter {
  provider: TTSProviderType;
  voiceId: string;
}

/**
 * Memory cache manager for IndexedDB audio cache.
 * Reduces N+1 query pattern by batch loading project audio into memory.
 */
class AudioCacheManagerImpl {
  private cache = new Map<string, Map<number, CachedAudio>>();
  private lruUpdates = new Map<string, Set<number>>();
  private flushTimer: number | null = null;
  private memoryCacheBytes = 0;
  private static readonly LRU_FLUSH_INTERVAL = 5000; // Batch LRU updates every 5 seconds
  private static readonly MAX_MEMORY_CACHE_BYTES = 50 * 1024 * 1024; // 50MB memory cache limit
  private static readonly MAX_DB_CACHE_BYTES = 500 * 1024 * 1024; // 500MB total DB cache limit

  /**
   * Get cached audio for a segment, using memory cache if available.
   * If filter is provided, only returns cache if provider/voice match.
   * This allows keeping old audio for different providers when user switches back.
   */
  async get(
    projectId: string,
    chunkIndex: number,
    filter?: CacheFilter
  ): Promise<CachedAudio | undefined> {
    // Check memory cache first
    const projectCache = this.cache.get(projectId);
    if (projectCache) {
      const cached = projectCache.get(chunkIndex);
      if (cached) {
        // If filter provided, check provider/voice match
        if (filter && (cached.provider !== filter.provider || cached.voiceId !== filter.voiceId)) {
          // Cache exists but for different provider/voice - return undefined
          // The old audio stays in DB for when user switches back
          return undefined;
        }
        // Queue LRU update instead of immediate write
        this.queueLRUUpdate(projectId, chunkIndex);
        return cached;
      }
      // Not in memory cache - it doesn't exist in DB either
      return undefined;
    }

    // Not preloaded - fall back to direct DB query
    const cached = await db.audioCache
      .where('[projectId+chunkIndex]')
      .equals([projectId, chunkIndex])
      .first();

    if (cached) {
      // If filter provided, check provider/voice match
      if (filter && (cached.provider !== filter.provider || cached.voiceId !== filter.voiceId)) {
        return undefined;
      }
      this.queueLRUUpdate(projectId, chunkIndex);
    }

    return cached;
  }

  /**
   * Prefetch all audio cache entries for a project into memory.
   * Call this when loading a project to avoid N+1 queries.
   * If filter is provided, statusMap only marks segments as ready if provider/voice match.
   */
  async prefetch(projectId: string, filter?: CacheFilter): Promise<Map<number, boolean>> {
    const cached = await db.audioCache
      .where('projectId')
      .equals(projectId)
      .toArray();

    // Store in memory cache (always store all items)
    const projectCache = new Map<number, CachedAudio>();
    const statusMap = new Map<number, boolean>();

    for (const item of cached) {
      projectCache.set(item.chunkIndex, item);
      // Only mark as ready if matches current provider/voice (or no filter)
      if (!filter || (item.provider === filter.provider && item.voiceId === filter.voiceId)) {
        statusMap.set(item.chunkIndex, true);
      }
    }

    // Remove old project cache size if re-prefetching
    const oldCache = this.cache.get(projectId);
    if (oldCache) {
      for (const item of oldCache.values()) {
        this.memoryCacheBytes -= item.sizeBytes;
      }
    }

    this.cache.set(projectId, projectCache);

    // Track new memory usage
    for (const item of projectCache.values()) {
      this.memoryCacheBytes += item.sizeBytes;
    }
    this.evictMemoryCache();

    return statusMap;
  }

  /**
   * Save audio to cache and update memory cache.
   */
  async save(audio: CachedAudio): Promise<void> {
    await db.audioCache.put(audio);

    // Update memory cache if project is loaded
    const projectCache = this.cache.get(audio.projectId);
    if (projectCache) {
      const existing = projectCache.get(audio.chunkIndex);
      if (existing) {
        this.memoryCacheBytes -= existing.sizeBytes;
      }
      projectCache.set(audio.chunkIndex, audio);
      this.memoryCacheBytes += audio.sizeBytes;
      this.evictMemoryCache();
    }
  }

  /**
   * Clear cache for a project.
   */
  async clear(projectId: string): Promise<void> {
    await db.audioCache.where('projectId').equals(projectId).delete();
    this.removeFromMemoryTracking(projectId);
    this.lruUpdates.delete(projectId);
  }

  /**
   * Invalidate memory cache for a project (keeps DB data).
   */
  invalidate(projectId: string): void {
    this.removeFromMemoryTracking(projectId);
  }

  private removeFromMemoryTracking(projectId: string): void {
    const projectCache = this.cache.get(projectId);
    if (projectCache) {
      for (const item of projectCache.values()) {
        this.memoryCacheBytes -= item.sizeBytes;
      }
      this.cache.delete(projectId);
    }
  }

  /**
   * Check if a project is prefetched into memory.
   */
  isPrefetched(projectId: string): boolean {
    return this.cache.has(projectId);
  }

  /**
   * Queue an LRU timestamp update for batching.
   */
  private queueLRUUpdate(projectId: string, chunkIndex: number): void {
    if (!this.lruUpdates.has(projectId)) {
      this.lruUpdates.set(projectId, new Set());
    }
    this.lruUpdates.get(projectId)!.add(chunkIndex);

    // Start flush timer if not running
    if (!this.flushTimer) {
      this.flushTimer = window.setTimeout(
        () => this.flushLRUUpdates(),
        AudioCacheManagerImpl.LRU_FLUSH_INTERVAL
      );
    }
  }

  /**
   * Batch flush all queued LRU updates.
   */
  private async flushLRUUpdates(): Promise<void> {
    this.flushTimer = null;

    const now = new Date();
    const updates: { projectId: string; chunkIndex: number }[] = [];

    for (const [projectId, chunks] of this.lruUpdates) {
      for (const chunkIndex of chunks) {
        updates.push({ projectId, chunkIndex });
      }
    }

    this.lruUpdates.clear();

    if (updates.length === 0) return;

    // Batch update using transaction
    await db.transaction('rw', db.audioCache, async () => {
      for (const { projectId, chunkIndex } of updates) {
        await db.audioCache
          .where('[projectId+chunkIndex]')
          .equals([projectId, chunkIndex])
          .modify({ accessedAt: now });
      }
    });
  }

  /**
   * Evict least-recently-accessed entries from memory cache until under limit.
   */
  private evictMemoryCache(): void {
    if (this.memoryCacheBytes <= AudioCacheManagerImpl.MAX_MEMORY_CACHE_BYTES) return;

    // Collect all entries with access time
    const entries: { projectId: string; chunkIndex: number; accessedAt: Date; sizeBytes: number }[] = [];
    for (const [projectId, projectCache] of this.cache) {
      for (const [chunkIndex, cached] of projectCache) {
        entries.push({ projectId, chunkIndex, accessedAt: cached.accessedAt, sizeBytes: cached.sizeBytes });
      }
    }

    // Sort oldest-accessed first
    entries.sort((a, b) => a.accessedAt.getTime() - b.accessedAt.getTime());

    // Evict until under limit
    for (const entry of entries) {
      if (this.memoryCacheBytes <= AudioCacheManagerImpl.MAX_MEMORY_CACHE_BYTES) break;
      const projectCache = this.cache.get(entry.projectId);
      if (projectCache) {
        projectCache.delete(entry.chunkIndex);
        this.memoryCacheBytes -= entry.sizeBytes;
        if (projectCache.size === 0) {
          this.cache.delete(entry.projectId);
        }
      }
    }
  }

  /**
   * Prune old DB entries when total cache exceeds limit.
   * Deletes least-recently-accessed entries until under 80% of limit.
   */
  async pruneDatabase(): Promise<number> {
    const allEntries = await db.audioCache.toArray();
    let totalBytes = 0;
    for (const entry of allEntries) {
      totalBytes += entry.sizeBytes;
    }

    if (totalBytes <= AudioCacheManagerImpl.MAX_DB_CACHE_BYTES) return 0;

    // Sort oldest-accessed first
    allEntries.sort((a, b) => a.accessedAt.getTime() - b.accessedAt.getTime());

    const target = AudioCacheManagerImpl.MAX_DB_CACHE_BYTES * 0.8;
    const idsToDelete: string[] = [];

    for (const entry of allEntries) {
      if (totalBytes <= target) break;
      idsToDelete.push(entry.id);
      totalBytes -= entry.sizeBytes;
    }

    if (idsToDelete.length > 0) {
      await db.audioCache.bulkDelete(idsToDelete);
      // Invalidate memory cache for affected projects
      for (const entry of allEntries) {
        if (idsToDelete.includes(entry.id)) {
          this.invalidate(entry.projectId);
        }
      }
    }

    return idsToDelete.length;
  }

  /**
   * Force flush pending LRU updates (useful before unload).
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushLRUUpdates();
  }

  /**
   * Reset the manager (for testing).
   */
  reset(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.cache.clear();
    this.lruUpdates.clear();
    this.memoryCacheBytes = 0;
  }
}

// Singleton instance
let instance: AudioCacheManagerImpl | null = null;

export function getAudioCacheManager(): AudioCacheManagerImpl {
  if (!instance) {
    instance = new AudioCacheManagerImpl();
  }
  return instance;
}

export function resetAudioCacheManager(): void {
  if (instance) {
    instance.reset();
    instance = null;
  }
}

export type AudioCacheManager = AudioCacheManagerImpl;
