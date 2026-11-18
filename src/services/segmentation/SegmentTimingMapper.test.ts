import { describe, it, expect } from 'vitest';
import {
  buildWordOffsetMap,
  mapSegmentsToTiming,
  findFirstWordInSegment,
  findSegmentForWord,
} from './SegmentTimingMapper';
import { segmentText } from './TextSegmenter';
import type { WordTiming } from '@/types';

describe('SegmentTimingMapper', () => {
  describe('buildWordOffsetMap', () => {
    it('uses the matched source length when provider punctuation is absent', () => {
      const text = 'One\n\nI';
      const timing: WordTiming[] = [
        { word: 'One!!!', startTime: 0, endTime: 0.5 },
        { word: 'I', startTime: 0.5, endTime: 1 },
      ];
      const offsets = buildWordOffsetMap(text, timing);
      expect(offsets.map(({ charStart, charEnd }) => [charStart, charEnd]))
        .toEqual([[0, 3], [5, 6]]);
      const segments = segmentText(text, 'project');
      expect(mapSegmentsToTiming(segments, offsets).map(range => range.startWordIndex))
        .toEqual([0, 1]);
      expect(findSegmentForWord(1, offsets, segments)?.index).toBe(1);
    });

    it('handles provider words wrapped in quotes and punctuation', () => {
      const timing: WordTiming[] = [
        { word: '“Hello!”', startTime: 0, endTime: 0.5 },
        { word: 'there', startTime: 0.5, endTime: 1 },
      ];
      const offsets = buildWordOffsetMap('Hello there', timing);
      expect(offsets.map(({ charStart, charEnd }) => [charStart, charEnd]))
        .toEqual([[0, 5], [6, 11]]);
    });

    it('should correctly map words to character positions in simple text', () => {
      const text = 'Hello world today';
      const timing: WordTiming[] = [
        { word: 'Hello', startTime: 0, endTime: 0.5 },
        { word: 'world', startTime: 0.5, endTime: 1.0 },
        { word: 'today', startTime: 1.0, endTime: 1.5 },
      ];

      const offsets = buildWordOffsetMap(text, timing);

      expect(offsets).toHaveLength(3);
      expect(offsets[0].charStart).toBe(0);  // "Hello" starts at 0
      expect(offsets[0].charEnd).toBe(5);
      expect(offsets[1].charStart).toBe(6);  // "world" starts at 6
      expect(offsets[1].charEnd).toBe(11);
      expect(offsets[2].charStart).toBe(12); // "today" starts at 12
      expect(offsets[2].charEnd).toBe(17);
    });

    it('should handle text with irregular whitespace', () => {
      const text = 'Hello   world\n\ntoday';  // Multiple spaces and newlines
      const timing: WordTiming[] = [
        { word: 'Hello', startTime: 0, endTime: 0.5 },
        { word: 'world', startTime: 0.5, endTime: 1.0 },
        { word: 'today', startTime: 1.0, endTime: 1.5 },
      ];

      const offsets = buildWordOffsetMap(text, timing);

      expect(offsets).toHaveLength(3);
      expect(offsets[0].charStart).toBe(0);   // "Hello" at 0
      expect(offsets[1].charStart).toBe(8);   // "world" at 8 (after "Hello   ")
      expect(offsets[2].charStart).toBe(15);  // "today" at 15 (after "Hello   world\n\n")
    });

    it('should handle punctuation in original text', () => {
      const text = 'Hello, world! How are you?';
      const timing: WordTiming[] = [
        { word: 'Hello,', startTime: 0, endTime: 0.5 },
        { word: 'world!', startTime: 0.5, endTime: 1.0 },
        { word: 'How', startTime: 1.0, endTime: 1.3 },
        { word: 'are', startTime: 1.3, endTime: 1.5 },
        { word: 'you?', startTime: 1.5, endTime: 2.0 },
      ];

      const offsets = buildWordOffsetMap(text, timing);

      expect(offsets).toHaveLength(5);
      expect(offsets[0].charStart).toBe(0);
      expect(offsets[1].charStart).toBe(7);  // "world!" after "Hello, "
    });

    it('should handle TTS that strips punctuation', () => {
      const text = 'Hello, world! How are you?';
      const timing: WordTiming[] = [
        { word: 'Hello', startTime: 0, endTime: 0.5 },  // TTS stripped comma
        { word: 'world', startTime: 0.5, endTime: 1.0 }, // TTS stripped !
        { word: 'How', startTime: 1.0, endTime: 1.3 },
        { word: 'are', startTime: 1.3, endTime: 1.5 },
        { word: 'you', startTime: 1.5, endTime: 2.0 },  // TTS stripped ?
      ];

      const offsets = buildWordOffsetMap(text, timing);

      expect(offsets).toHaveLength(5);
      expect(offsets[0].charStart).toBe(0);   // "Hello" found at 0
      expect(offsets[1].charStart).toBe(7);   // "world" found at 7
    });

    it('should handle quotes and dialogue', () => {
      const text = '"Hello," she said. "How are you?"';
      const timing: WordTiming[] = [
        { word: 'Hello,', startTime: 0, endTime: 0.5 },
        { word: 'she', startTime: 0.5, endTime: 0.7 },
        { word: 'said.', startTime: 0.7, endTime: 1.0 },
        { word: 'How', startTime: 1.0, endTime: 1.3 },
        { word: 'are', startTime: 1.3, endTime: 1.5 },
        { word: 'you?', startTime: 1.5, endTime: 2.0 },
      ];

      const offsets = buildWordOffsetMap(text, timing);

      expect(offsets).toHaveLength(6);
      expect(offsets[0].charStart).toBe(1);   // "Hello," after opening quote
      expect(offsets[1].charStart).toBe(9);   // "she" (after `"Hello," `)
    });
  });

  describe('mapSegmentsToTiming', () => {
    it('should map single segment to word range', () => {
      const text = 'Hello world today';
      const segments = segmentText(text, 'test-project');
      const timing: WordTiming[] = [
        { word: 'Hello', startTime: 0, endTime: 0.5 },
        { word: 'world', startTime: 0.5, endTime: 1.0 },
        { word: 'today', startTime: 1.0, endTime: 1.5 },
      ];

      const wordOffsets = buildWordOffsetMap(text, timing);
      const segmentRanges = mapSegmentsToTiming(segments, wordOffsets);

      expect(segmentRanges).toHaveLength(1);
      expect(segmentRanges[0].startWordIndex).toBe(0);
      expect(segmentRanges[0].endWordIndex).toBe(2);
      expect(segmentRanges[0].startTime).toBe(0);
      expect(segmentRanges[0].endTime).toBe(1.5);
    });

    it('should map multiple segments to correct word ranges', () => {
      const text = 'First paragraph here.\n\nSecond paragraph now.';
      const segments = segmentText(text, 'test-project');
      const timing: WordTiming[] = [
        { word: 'First', startTime: 0, endTime: 0.3 },
        { word: 'paragraph', startTime: 0.3, endTime: 0.7 },
        { word: 'here.', startTime: 0.7, endTime: 1.0 },
        { word: 'Second', startTime: 1.0, endTime: 1.3 },
        { word: 'paragraph', startTime: 1.3, endTime: 1.7 },
        { word: 'now.', startTime: 1.7, endTime: 2.0 },
      ];

      const wordOffsets = buildWordOffsetMap(text, timing);
      const segmentRanges = mapSegmentsToTiming(segments, wordOffsets);

      expect(segments).toHaveLength(2);
      expect(segmentRanges).toHaveLength(2);

      // First segment should have words 0-2
      expect(segmentRanges[0].startWordIndex).toBe(0);
      expect(segmentRanges[0].endWordIndex).toBe(2);
      expect(segmentRanges[0].startTime).toBe(0);
      expect(segmentRanges[0].endTime).toBe(1.0);

      // Second segment should have words 3-5
      expect(segmentRanges[1].startWordIndex).toBe(3);
      expect(segmentRanges[1].endWordIndex).toBe(5);
      expect(segmentRanges[1].startTime).toBe(1.0);
      expect(segmentRanges[1].endTime).toBe(2.0);
    });

    it('should handle text with extra whitespace between paragraphs', () => {
      const text = 'First section.\n\n\n\n\nSecond section.';  // Many newlines
      const segments = segmentText(text, 'test-project');
      const timing: WordTiming[] = [
        { word: 'First', startTime: 0, endTime: 0.3 },
        { word: 'section.', startTime: 0.3, endTime: 0.7 },
        { word: 'Second', startTime: 0.7, endTime: 1.0 },
        { word: 'section.', startTime: 1.0, endTime: 1.4 },
      ];

      const wordOffsets = buildWordOffsetMap(text, timing);
      const segmentRanges = mapSegmentsToTiming(segments, wordOffsets);

      expect(segments).toHaveLength(2);
      expect(segmentRanges).toHaveLength(2);

      // Second segment words should be correctly identified
      expect(segmentRanges[1].startWordIndex).toBe(2);
      expect(segmentRanges[1].endWordIndex).toBe(3);
    });
  });

  describe('findFirstWordInSegment', () => {
    it('should find first word in a segment', () => {
      const text = 'First part.\n\nSecond part.';
      const segments = segmentText(text, 'test-project');
      const timing: WordTiming[] = [
        { word: 'First', startTime: 0, endTime: 0.3 },
        { word: 'part.', startTime: 0.3, endTime: 0.6 },
        { word: 'Second', startTime: 0.6, endTime: 0.9 },
        { word: 'part.', startTime: 0.9, endTime: 1.2 },
      ];

      const wordOffsets = buildWordOffsetMap(text, timing);

      // Find first word in second segment
      const firstWord = findFirstWordInSegment(segments[1], wordOffsets);

      expect(firstWord).not.toBeNull();
      expect(firstWord!.wordIndex).toBe(2);
      expect(firstWord!.timing.word).toBe('Second');
      expect(firstWord!.timing.startTime).toBe(0.6);
    });

    it('should return null for segment with no words', () => {
      const segments = [
        {
          id: 'test-seg-0',
          index: 0,
          text: 'Test',
          startOffset: 1000,  // Beyond any word
          endOffset: 1100,
          type: 'paragraph' as const,
          hasAudio: false,
          isGenerating: false,
        },
      ];

      const timing: WordTiming[] = [
        { word: 'Hello', startTime: 0, endTime: 0.5 },
      ];

      const wordOffsets = buildWordOffsetMap('Hello', timing);
      const firstWord = findFirstWordInSegment(segments[0], wordOffsets);

      expect(firstWord).toBeNull();
    });
  });

  describe('findSegmentForWord', () => {
    it('should find correct segment for a word', () => {
      const text = 'First part.\n\nSecond part.';
      const segments = segmentText(text, 'test-project');
      const timing: WordTiming[] = [
        { word: 'First', startTime: 0, endTime: 0.3 },
        { word: 'part.', startTime: 0.3, endTime: 0.6 },
        { word: 'Second', startTime: 0.6, endTime: 0.9 },
        { word: 'part.', startTime: 0.9, endTime: 1.2 },
      ];

      const wordOffsets = buildWordOffsetMap(text, timing);

      // Word 0 should be in segment 0
      const seg0 = findSegmentForWord(0, wordOffsets, segments);
      expect(seg0).not.toBeNull();
      expect(seg0!.index).toBe(0);

      // Word 2 should be in segment 1
      const seg1 = findSegmentForWord(2, wordOffsets, segments);
      expect(seg1).not.toBeNull();
      expect(seg1!.index).toBe(1);
    });
  });

  describe('Integration: Segment clicking and seeking', () => {
    it('should provide correct seek time when clicking segment 2', () => {
      // This test simulates the bug where clicking a segment
      // would seek to the wrong position
      const text = 'The quick brown fox.\n\nJumps over the lazy dog.\n\nThe end is near.';
      const segments = segmentText(text, 'test-project');

      // Simulate TTS timing response
      const timing: WordTiming[] = [
        { word: 'The', startTime: 0.0, endTime: 0.2 },
        { word: 'quick', startTime: 0.2, endTime: 0.5 },
        { word: 'brown', startTime: 0.5, endTime: 0.8 },
        { word: 'fox.', startTime: 0.8, endTime: 1.1 },
        { word: 'Jumps', startTime: 1.1, endTime: 1.4 },
        { word: 'over', startTime: 1.4, endTime: 1.6 },
        { word: 'the', startTime: 1.6, endTime: 1.8 },
        { word: 'lazy', startTime: 1.8, endTime: 2.1 },
        { word: 'dog.', startTime: 2.1, endTime: 2.4 },
        { word: 'The', startTime: 2.4, endTime: 2.6 },
        { word: 'end', startTime: 2.6, endTime: 2.8 },
        { word: 'is', startTime: 2.8, endTime: 2.9 },
        { word: 'near.', startTime: 2.9, endTime: 3.2 },
      ];

      expect(segments).toHaveLength(3);

      const wordOffsets = buildWordOffsetMap(text, timing);
      const segmentRanges = mapSegmentsToTiming(segments, wordOffsets);

      // When clicking segment 1 (index 1), we should seek to "Jumps"
      const seg1Range = segmentRanges.find(r => r.segmentIndex === 1);
      expect(seg1Range).toBeDefined();
      expect(seg1Range!.startTime).toBe(1.1); // "Jumps" starts at 1.1s

      // When clicking segment 2 (index 2), we should seek to "The end"
      const seg2Range = segmentRanges.find(r => r.segmentIndex === 2);
      expect(seg2Range).toBeDefined();
      expect(seg2Range!.startTime).toBe(2.4); // "The" starts at 2.4s
    });

    it('should work with old buggy accumulation approach for comparison', () => {
      // This test demonstrates the bug with the old approach
      const text = 'The quick brown fox.\n\nJumps over the lazy dog.';

      // Old buggy approach: accumulate word.length + 1
      const timing: WordTiming[] = [
        { word: 'The', startTime: 0.0, endTime: 0.2 },
        { word: 'quick', startTime: 0.2, endTime: 0.5 },
        { word: 'brown', startTime: 0.5, endTime: 0.8 },
        { word: 'fox.', startTime: 0.8, endTime: 1.1 },
        { word: 'Jumps', startTime: 1.1, endTime: 1.4 },
        { word: 'over', startTime: 1.4, endTime: 1.6 },
        { word: 'the', startTime: 1.6, endTime: 1.8 },
        { word: 'lazy', startTime: 1.8, endTime: 2.1 },
        { word: 'dog.', startTime: 2.1, endTime: 2.4 },
      ];

      // Old approach calculation
      let oldCharOffset = 0;
      const oldOffsets: number[] = [];
      for (const word of timing) {
        oldOffsets.push(oldCharOffset);
        oldCharOffset += word.word.length + 1;
      }

      // Old approach says "Jumps" is at position 21 (3+1 + 5+1 + 5+1 + 4+1 = 21)
      expect(oldOffsets[4]).toBe(21);

      // But in the actual text "Jumps" starts at position 22
      // (because there are TWO newlines between paragraphs)
      const actualJumpsPosition = text.indexOf('Jumps');
      expect(actualJumpsPosition).toBe(22);

      // This 2-character difference causes segment mapping to fail!
      // The new approach correctly finds the actual position
      const newOffsets = buildWordOffsetMap(text, timing);
      expect(newOffsets[4].charStart).toBe(22);
    });
  });
});
