# Audio Preloading and Deduplication System

This document describes how Narratoqo handles audio generation, preloading, and prevents duplicate API calls during playback.

## Overview

When playing audiobooks, Narratoqo generates audio on-demand for each text segment using TTS providers. To ensure seamless playback and avoid unnecessary API calls (which cost money and add latency), the system implements:

1. **Multi-layer caching** - IndexedDB persistence + in-memory cache
2. **Preloading** - Generate audio for upcoming segments in the background
3. **Promise deduplication** - Prevent concurrent duplicate API calls

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Project.tsx                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  generateSegmentAudio()                      ││
│  │  1. Check promise tracker (sync)                             ││
│  │  2. Create placeholder promise (sync) - KEY STEP             ││
│  │  3. Check memory cache (async)                               ││
│  │  4. Generate via TTS provider → resolve promise → cache      ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌──────────────────┐       │        ┌───────────────────────┐ │
│  │ handleSegmentClick│───────┼───────→│ preloadNextSegments   │ │
│  │ (user click/auto) │       │        │ (background, no UI)   │ │
│  └──────────────────┘       │        └───────────────────────┘ │
└─────────────────────────────┼───────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Promise Tracker │  │ AudioCacheManager│  │  TTS Provider   │
│ (Ref<Map>)      │  │ (Memory Cache)   │  │ (API/Browser)   │
└─────────────────┘  └────────┬────────┘  └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   IndexedDB     │
                    │ (Persistent)    │
                    └─────────────────┘
```

## Key Components

### 1. Promise Tracker (`generationPromisesRef`)

Location: `src/pages/Project.tsx:77`

```typescript
const generationPromisesRef = useRef<Map<number, Promise<CachedAudio | undefined>>>(new Map());
```

A React ref holding a Map of segment indices to their in-progress generation promises. This prevents duplicate API calls when:

- User clicks a segment while it's being preloaded
- Auto-play advances while preload is in progress
- Multiple rapid clicks on the same segment

### 2. Audio Cache Manager

Location: `src/services/audio/AudioCacheManager.ts`

In-memory cache backed by IndexedDB. Provides fast lookups without hitting the database for every request.

```typescript
// Prefetch all segment statuses for a project
await audioCacheManager.prefetch(projectId);

// Check/get cached audio
const cached = await audioCacheManager.get(projectId, segmentIndex);

// Save generated audio
await audioCacheManager.save(cacheEntry);
```

### 3. Generate Segment Audio Function

Location: `src/pages/Project.tsx:210-287`

The core function that handles all audio generation with deduplication using the **placeholder promise pattern**:

```typescript
const generateSegmentAudio = useCallback(async (
  segmentIndex: number,
  showSpinner = true
): Promise<CachedAudio | undefined> => {

  // 1. SYNC CHECK: Is generation already in progress?
  const existingPromise = generationPromisesRef.current.get(segmentIndex);
  if (existingPromise) {
    return existingPromise;  // Await existing, don't start new
  }

  // 2. CREATE PLACEHOLDER PROMISE IMMEDIATELY (before any async!)
  // This is the key to preventing race conditions
  let resolvePromise!: (value: CachedAudio | undefined) => void;
  let rejectPromise!: (error: Error) => void;
  const placeholderPromise = new Promise<CachedAudio | undefined>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  generationPromisesRef.current.set(segmentIndex, placeholderPromise);

  try {
    // 3. Now safe to check cache - other calls will get the placeholder
    const cached = await audioCacheManager.get(projectId, segmentIndex);
    if (cached) {
      resolvePromise(cached);
      return cached;
    }

    // 4. Generate new audio
    const result = await provider.synthesize({ text, voiceId });
    await saveCachedAudio(cacheEntry);
    await audioCacheManager.save(cacheEntry);

    resolvePromise(cacheEntry);
    return cacheEntry;
  } catch (error) {
    rejectPromise(error as Error);
    return undefined;
  } finally {
    generationPromisesRef.current.delete(segmentIndex);
  }
}, [/* dependencies */]);
```

### 4. Preload Next Segments

Location: `src/pages/Project.tsx:305-324`

Preloads the next 3 readable segments after the current one. Only preloads segments that contain actual readable text (skips empty/whitespace segments):

```typescript
const preloadNextSegments = useCallback(async (fromIndex: number, count: number = 3) => {
  if (!currentProject) return;

  let preloaded = 0;
  let index = fromIndex;

  while (preloaded < count && index < segments.length - 1) {
    // Find next segment with readable text
    const nextIndex = findNextReadableSegment(segments, index, 'forward');
    if (nextIndex === -1) break;

    // Use generateSegmentAudio which handles cache checks and deduplication
    // Pass showSpinner=false for background preloading
    // Add .catch() to prevent unhandled promise rejections
    generateSegmentAudio(nextIndex, false)
      .catch(error => console.warn(`Preload segment ${nextIndex} failed:`, error));

    preloaded++;
    index = nextIndex;
  }
}, [currentProject, segments, generateSegmentAudio]);
```

Called after audio starts playing to ensure upcoming segments are ready.

**Important**: The `.catch()` handler is required to prevent unhandled promise rejection warnings in the console when preloading fails (e.g., due to network issues). The error is logged but doesn't interrupt playback.

## Race Condition Prevention

### The Problem

Without proper deduplication, this scenario causes duplicate API calls:

1. User clicks segment 5
2. `handleSegmentClick(5)` starts
3. Background preload fires `generateSegmentAudio(5, false)`
4. Both calls check cache (empty) - async operation
5. Both calls start TTS generation - **duplicate API call!**

### The Solution: Placeholder Promise Pattern

The key insight is to **track the promise BEFORE any async operation**:

```
┌─────────────────────────────────────────────────────────┐
│           generateSegmentAudio(segmentIndex)            │
├─────────────────────────────────────────────────────────┤
│  ① Sync check: promise tracker                          │
│     └─ If promise exists → return it (await existing)   │
│                                                         │
│  ② Create placeholder promise IMMEDIATELY               │
│     └─ Track it in promise tracker NOW                  │
│     └─ Other concurrent calls will get this placeholder │
│                                                         │
│  ③ Safe to do async operations now                      │
│     └─ Check cache (other calls wait on placeholder)    │
│     └─ Generate audio via TTS                           │
│     └─ Cache result                                     │
│                                                         │
│  ④ Resolve/reject the placeholder promise               │
│     └─ All waiters receive the result                   │
│     └─ Remove from promise tracker                      │
└─────────────────────────────────────────────────────────┘
```

**Why placeholder promises work:**

- **Sync tracking**: The promise is tracked BEFORE any async work begins
- **Single generation**: Multiple concurrent calls all await the same promise
- **Clean resolution**: `resolvePromise(result)` notifies all waiters simultaneously
- **Error handling**: `rejectPromise(error)` propagates failures to all waiters

## Configuration

### Preload Count

Set in `Project.tsx` `preloadNextSegments`:

```typescript
const preloadNextSegments = useCallback(async (fromIndex: number, count: number = 2)
```

The default is 2 segments ahead, which provides a good balance between seamless playback and not over-fetching.

### Cache Limits

Set in `AudioCacheManager.ts`:

- LRU eviction when cache size exceeds limit
- Per-project audio cleanup on project deletion
- Automatic cleanup of old entries

## Debugging

### Check Generation Status

Each segment has a status tracked in `segmentAudioStatus`:

- `'idle'` - Not generated yet
- `'generating'` - API call in progress
- `'ready'` - Cached and ready to play

### Console Logging

To debug duplicate calls, temporarily add logging:

```typescript
const generateSegmentAudio = useCallback(async (segmentIndex, showSpinner) => {
  console.log(`[Audio] generateSegmentAudio(${segmentIndex}, showSpinner=${showSpinner})`);

  const existingPromise = generationPromisesRef.current.get(segmentIndex);
  if (existingPromise) {
    console.log(`[Audio] Segment ${segmentIndex}: awaiting existing promise`);
    return existingPromise;
  }
  // ...
});
```

## Related Files

- `src/pages/Project.tsx` - Main playback logic with deduplication
- `src/services/audio/AudioCacheManager.ts` - Memory cache with IndexedDB backing
- `src/services/audio/AudioPlayer.ts` - Audio playback with Howler.js
- `src/db/schema.ts` - IndexedDB operations (`saveCachedAudio`, `getCachedAudio`)
- `src/services/tts/*.ts` - TTS provider implementations
- `src/components/ErrorBoundary.tsx` - Catches rendering errors gracefully
