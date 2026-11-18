/**
 * Maps word timing from TTS to text segments.
 * This module handles the conversion between TTS word timing data
 * and the segment structure used for display.
 */

import type { WordTiming } from '@/types';
import type { TextSegment } from './TextSegmenter';

export interface SegmentTimingRange {
  segmentIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  startTime: number;
  endTime: number;
}

export interface WordOffsetInfo {
  wordIndex: number;
  charStart: number;
  charEnd: number;
  timing: WordTiming;
}

/**
 * Build word offset map by searching for each word in the original text.
 * This correctly handles irregular whitespace, newlines, and other formatting.
 */
export function buildWordOffsetMap(
  originalText: string,
  timing: WordTiming[]
): WordOffsetInfo[] {
  const wordOffsets: WordOffsetInfo[] = [];
  let searchPosition = 0;

  for (let i = 0; i < timing.length; i++) {
    const word = timing[i];
    const wordText = word.word.trim();

    // Search for this word starting from the current position
    // Handle punctuation: TTS might strip or keep punctuation differently
    let foundIndex = originalText.indexOf(wordText, searchPosition);
    let matchedLength = wordText.length;

    // Search punctuation variants and retain the actual matched source length.
    if (foundIndex === -1 && wordText.length > 1) {
      const withoutTrailing = wordText.replace(/[.,!?;:'")\]”’]+$/, '');
      const withoutLeading = wordText.replace(/^['"([“‘]+/, '');
      const withoutBoth = withoutTrailing.replace(/^['"([“‘]+/, '');
      for (const candidate of [withoutTrailing, withoutLeading, withoutBoth]) {
        if (candidate.length === 0) continue;
        foundIndex = originalText.indexOf(candidate, searchPosition);
        if (foundIndex !== -1) {
          matchedLength = candidate.length;
          break;
        }
      }
    }

    if (foundIndex !== -1) {
      wordOffsets.push({
        wordIndex: i,
        charStart: foundIndex,
        charEnd: foundIndex + matchedLength,
        timing: word,
      });
      searchPosition = foundIndex + matchedLength;
    } else {
      // Fallback: estimate position based on previous words
      // This handles cases where TTS normalizes text differently
      const estimatedStart = searchPosition;
      wordOffsets.push({
        wordIndex: i,
        charStart: estimatedStart,
        charEnd: estimatedStart + wordText.length,
        timing: word,
      });
      searchPosition = estimatedStart + wordText.length + 1;
    }
  }

  return wordOffsets;
}

/**
 * Map segments to their corresponding word timing ranges.
 * Uses actual character positions from buildWordOffsetMap.
 */
export function mapSegmentsToTiming(
  segments: TextSegment[],
  wordOffsets: WordOffsetInfo[]
): SegmentTimingRange[] {
  const segmentRanges: SegmentTimingRange[] = [];

  for (const segment of segments) {
    // Find words that fall within this segment's character range
    const wordsInSegment = wordOffsets.filter(
      (w) => w.charStart >= segment.startOffset && w.charStart < segment.endOffset
    );

    if (wordsInSegment.length > 0) {
      segmentRanges.push({
        segmentIndex: segment.index,
        startWordIndex: wordsInSegment[0].wordIndex,
        endWordIndex: wordsInSegment[wordsInSegment.length - 1].wordIndex,
        startTime: wordsInSegment[0].timing.startTime,
        endTime: wordsInSegment[wordsInSegment.length - 1].timing.endTime,
      });
    }
  }

  return segmentRanges;
}

/**
 * Find the first word that falls within a segment's range.
 * Returns the word's timing for seeking.
 */
export function findFirstWordInSegment(
  segment: TextSegment,
  wordOffsets: WordOffsetInfo[]
): WordOffsetInfo | null {
  for (const wordInfo of wordOffsets) {
    if (wordInfo.charStart >= segment.startOffset && wordInfo.charStart < segment.endOffset) {
      return wordInfo;
    }
  }
  return null;
}

/**
 * Find which segment a word belongs to based on character position.
 */
export function findSegmentForWord(
  wordIndex: number,
  wordOffsets: WordOffsetInfo[],
  segments: TextSegment[]
): TextSegment | null {
  const wordInfo = wordOffsets.find((w) => w.wordIndex === wordIndex);
  if (!wordInfo) return null;

  for (const segment of segments) {
    if (wordInfo.charStart >= segment.startOffset && wordInfo.charStart < segment.endOffset) {
      return segment;
    }
  }
  return null;
}
