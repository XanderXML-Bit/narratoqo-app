/**
 * Estimates word timing for TTS providers that don't return timing data.
 * Uses character-proportional distribution based on audio duration.
 */

import type { WordTiming } from '@/types';

/**
 * Estimate word timing by distributing time proportionally based on character positions.
 *
 * Algorithm:
 * 1. Split text into words
 * 2. Find each word's character position in the original text
 * 3. Calculate startTime = (charPosition / totalChars) * duration
 * 4. Calculate endTime based on word length proportion
 *
 * @param text - The original text that was synthesized
 * @param duration - The total audio duration in seconds
 * @returns Array of WordTiming objects with estimated times
 */
export function estimateWordTiming(text: string, duration: number): WordTiming[] {
  if (!text || duration <= 0) {
    return [];
  }

  const words = text.trim().split(/\s+/);
  if (words.length === 0) {
    return [];
  }

  const totalChars = text.length;
  const timings: WordTiming[] = [];
  let searchPos = 0;

  for (const word of words) {
    if (!word) continue;

    // Find actual position in text (handles multiple spaces, newlines)
    const wordStart = text.indexOf(word, searchPos);
    if (wordStart === -1) {
      // Word not found, estimate position
      const estimatedStart = searchPos;
      const startTime = (estimatedStart / totalChars) * duration;
      const endTime = ((estimatedStart + word.length) / totalChars) * duration;

      timings.push({
        word,
        startTime,
        endTime,
        charStart: estimatedStart,
        charEnd: estimatedStart + word.length,
      });

      searchPos = estimatedStart + word.length;
      continue;
    }

    const wordEnd = wordStart + word.length;
    const startTime = (wordStart / totalChars) * duration;
    const endTime = (wordEnd / totalChars) * duration;

    timings.push({
      word,
      startTime,
      endTime,
      charStart: wordStart,
      charEnd: wordEnd,
    });

    searchPos = wordEnd;
  }

  return timings;
}

/**
 * Alternative estimation using words-per-minute (WPM) model.
 * Better for natural speech rhythm as it accounts for pauses between words.
 *
 * Average speaking rates:
 * - Slow: 100-120 WPM
 * - Normal: 120-150 WPM
 * - Fast: 150-180 WPM
 *
 * @param text - The original text that was synthesized
 * @param duration - The total audio duration in seconds
 * @param targetWPM - Target words per minute (default: 140)
 * @returns Array of WordTiming objects with estimated times
 */
export function estimateWordTimingByWPM(
  text: string,
  duration: number,
  _targetWPM: number = 140
): WordTiming[] {
  if (!text || duration <= 0) {
    return [];
  }

  const words = text.trim().split(/\s+/);
  if (words.length === 0) {
    return [];
  }

  // Calculate average duration per word based on actual audio duration
  const avgWordDuration = duration / words.length;

  const timings: WordTiming[] = [];
  let currentTime = 0;
  let searchPos = 0;

  for (const word of words) {
    if (!word) continue;

    // Find actual position in text
    const wordStart = text.indexOf(word, searchPos);
    const charStart = wordStart !== -1 ? wordStart : searchPos;
    const charEnd = charStart + word.length;

    // Calculate word duration with slight variation based on length
    // Longer words take slightly more time
    const avgWordLength = text.length / words.length;
    const lengthFactor = word.length / avgWordLength;
    const wordDuration = avgWordDuration * (0.7 + 0.3 * lengthFactor);

    timings.push({
      word,
      startTime: currentTime,
      endTime: Math.min(currentTime + wordDuration, duration),
      charStart,
      charEnd,
    });

    currentTime += wordDuration;
    searchPos = charEnd;
  }

  // Normalize to fit exactly within duration
  if (timings.length > 0 && currentTime > 0) {
    const scaleFactor = duration / currentTime;
    let adjustedTime = 0;

    for (const timing of timings) {
      const wordDuration = (timing.endTime - timing.startTime) * scaleFactor;
      timing.startTime = adjustedTime;
      timing.endTime = adjustedTime + wordDuration;
      adjustedTime += wordDuration;
    }

    // Ensure last word ends exactly at duration
    if (timings.length > 0) {
      timings[timings.length - 1].endTime = duration;
    }
  }

  return timings;
}

/**
 * Find the word index at a given time position.
 * Uses binary search for efficiency.
 *
 * @param timing - Array of word timings
 * @param time - Current playback time in seconds
 * @returns Index of the current word, or -1 if not found
 */
export function findWordIndexAtTime(timing: WordTiming[], time: number): number {
  if (!timing || timing.length === 0) {
    return -1;
  }

  // Binary search for efficiency
  let low = 0;
  let high = timing.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const word = timing[mid];

    if (time >= word.startTime && time < word.endTime) {
      return mid;
    } else if (time < word.startTime) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Check if we're past the last word
  const lastWord = timing[timing.length - 1];
  if (time >= lastWord.startTime && time <= lastWord.endTime) {
    return timing.length - 1;
  }

  return -1;
}

/**
 * Estimate timing for a segment based on its position in the full text.
 * Used when generating audio for individual segments.
 *
 * @param segmentText - The segment's text content
 * @param segmentDuration - The audio duration for this segment
 * @param segmentStartOffset - Character offset where segment starts in full text
 * @returns Array of WordTiming objects with times relative to segment audio
 */
export function estimateSegmentTiming(
  segmentText: string,
  segmentDuration: number,
  segmentStartOffset: number = 0
): WordTiming[] {
  const timing = estimateWordTiming(segmentText, segmentDuration);

  // Adjust character offsets to be relative to full text
  for (const word of timing) {
    word.charStart = (word.charStart ?? 0) + segmentStartOffset;
    word.charEnd = (word.charEnd ?? 0) + segmentStartOffset;
  }

  return timing;
}
