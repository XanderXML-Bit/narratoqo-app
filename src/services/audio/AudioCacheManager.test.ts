import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Dexie before importing
vi.mock('@/db/schema', () => ({
  db: {
    audioCache: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(undefined),
          toArray: vi.fn().mockResolvedValue([]),
          modify: vi.fn().mockResolvedValue(0),
          delete: vi.fn().mockResolvedValue(0),
        }),
      }),
      put: vi.fn().mockResolvedValue('id'),
      toArray: vi.fn().mockResolvedValue([]),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
    },
    transaction: vi.fn((_mode: string, _table: unknown, fn: () => Promise<void>) => fn()),
  },
}));

import { getAudioCacheManager, resetAudioCacheManager } from './AudioCacheManager';
import type { CachedAudio } from '@/types';

function makeCachedAudio(projectId: string, chunkIndex: number, sizeBytes = 1024): CachedAudio {
  return {
    id: `${projectId}-${chunkIndex}`,
    projectId,
    chunkIndex,
    blob: new Blob(['x'.repeat(sizeBytes)]),
    provider: 'webspeech' as const,
    voiceId: 'default',
    createdAt: new Date(),
    accessedAt: new Date(),
    sizeBytes,
  };
}

describe('AudioCacheManager', () => {
  beforeEach(async () => {
    resetAudioCacheManager();
    vi.clearAllMocks();
    vi.useFakeTimers();
    const { db } = await import('@/db/schema');
    // Restore query defaults; clearing call counts alone leaks the previous test's rows.
    vi.mocked(db.audioCache.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(undefined),
        toArray: vi.fn().mockResolvedValue([]),
        modify: vi.fn().mockResolvedValue(0),
        delete: vi.fn().mockResolvedValue(0),
      }),
    } as never);
  });

  afterEach(() => {
    resetAudioCacheManager();
    vi.useRealTimers();
  });

  it('returns singleton instance', () => {
    const a = getAudioCacheManager();
    const b = getAudioCacheManager();
    expect(a).toBe(b);
  });

  it('reset creates new instance', () => {
    const a = getAudioCacheManager();
    resetAudioCacheManager();
    const b = getAudioCacheManager();
    expect(a).not.toBe(b);
  });

  describe('save and get from memory cache', () => {
    it('returns undefined when not prefetched', async () => {
      const mgr = getAudioCacheManager();
      const result = await mgr.get('proj1', 0);
      expect(result).toBeUndefined();
    });

    it('returns cached audio after prefetch', async () => {
      const mgr = getAudioCacheManager();
      const { db } = await import('@/db/schema');
      const audio = makeCachedAudio('proj1', 0);

      vi.mocked(db.audioCache.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([audio]),
          first: vi.fn().mockResolvedValue(audio),
          modify: vi.fn().mockResolvedValue(1),
          delete: vi.fn().mockResolvedValue(0),
        }),
      } as never);

      await mgr.prefetch('proj1');
      const result = await mgr.get('proj1', 0);
      expect(result).toBeDefined();
      expect(result?.chunkIndex).toBe(0);
    });
  });

  describe('filter', () => {
    it.each(['cold', 'prefetched'])('checks provider and voice on %s cache reads without discarding a match', async mode => {
      const mgr = getAudioCacheManager();
      const { db } = await import('@/db/schema');
      const audio = makeCachedAudio('proj1', 0);
      const equals = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(audio),
        toArray: vi.fn().mockResolvedValue([audio]),
      });
      vi.mocked(db.audioCache.where).mockReturnValue({ equals } as never);
      if (mode === 'prefetched') await mgr.prefetch('proj1');

      expect(await mgr.get('proj1', 0, { provider: 'piper', voiceId: 'default' })).toBeUndefined();
      expect(await mgr.get('proj1', 0, { provider: 'webspeech', voiceId: 'other' })).toBeUndefined();
      expect(await mgr.get('proj1', 0, { provider: 'webspeech', voiceId: 'default' })).toBe(audio);
      if (mode === 'prefetched') {
        expect(equals).toHaveBeenCalledExactlyOnceWith('proj1');
      } else {
        expect(db.audioCache.where).toHaveBeenCalledWith('[projectId+chunkIndex]');
        expect(equals.mock.calls).toEqual([
          [['proj1', 0]], [['proj1', 0]], [['proj1', 0]],
        ]);
      }
    });

    it('marks only matching provider and voice entries ready during prefetch', async () => {
      const mgr = getAudioCacheManager();
      const { db } = await import('@/db/schema');
      const match = makeCachedAudio('proj1', 0);
      const otherVoice = { ...makeCachedAudio('proj1', 1), voiceId: 'other' };
      const otherProvider = { ...makeCachedAudio('proj1', 2), provider: 'piper' as const };
      vi.mocked(db.audioCache.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([match, otherVoice, otherProvider]),
        }),
      } as never);
      const status = await mgr.prefetch('proj1', { provider: 'webspeech', voiceId: 'default' });
      expect([...status.entries()]).toEqual([[0, true]]);
      expect(await mgr.get('proj1', 1, { provider: 'webspeech', voiceId: 'other' })).toBe(otherVoice);
      expect(await mgr.get('proj1', 2, { provider: 'piper', voiceId: 'default' })).toBe(otherProvider);
    });

    it('returns undefined when filter does not match', async () => {
      const mgr = getAudioCacheManager();
      const audio = makeCachedAudio('proj1', 0);
      const { db } = await import('@/db/schema');

      vi.mocked(db.audioCache.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([audio]),
          first: vi.fn().mockResolvedValue(audio),
          modify: vi.fn().mockResolvedValue(1),
          delete: vi.fn().mockResolvedValue(0),
        }),
      } as never);

      await mgr.prefetch('proj1');
      const result = await mgr.get('proj1', 0, { provider: 'openai' as never, voiceId: 'nova' });
      expect(result).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('removes project from memory cache', async () => {
      const mgr = getAudioCacheManager();
      const audio = makeCachedAudio('proj1', 0);
      const { db } = await import('@/db/schema');

      vi.mocked(db.audioCache.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([audio]),
          first: vi.fn().mockResolvedValue(audio),
          modify: vi.fn().mockResolvedValue(1),
          delete: vi.fn().mockResolvedValue(0),
        }),
      } as never);

      await mgr.prefetch('proj1');
      expect(mgr.isPrefetched('proj1')).toBe(true);

      await mgr.clear('proj1');
      expect(mgr.isPrefetched('proj1')).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('removes from memory but not DB', async () => {
      const mgr = getAudioCacheManager();
      const audio = makeCachedAudio('proj1', 0);
      const { db } = await import('@/db/schema');

      vi.mocked(db.audioCache.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([audio]),
          first: vi.fn().mockResolvedValue(audio),
          modify: vi.fn().mockResolvedValue(1),
          delete: vi.fn().mockResolvedValue(0),
        }),
      } as never);

      await mgr.prefetch('proj1');
      mgr.invalidate('proj1');
      expect(mgr.isPrefetched('proj1')).toBe(false);
    });
  });

  describe('flush', () => {
    it('flushes without error when no pending updates', async () => {
      const mgr = getAudioCacheManager();
      await expect(mgr.flush()).resolves.toBeUndefined();
    });
  });
});
