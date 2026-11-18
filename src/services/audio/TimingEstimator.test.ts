import { describe, it, expect } from 'vitest';
import {
  estimateWordTiming,
  estimateWordTimingByWPM,
  findWordIndexAtTime,
  estimateSegmentTiming,
} from './TimingEstimator';

describe('TimingEstimator', () => {
  describe('estimateWordTiming', () => {
    it('should distribute timing proportionally to character positions', () => {
      const text = 'Hello world today';
      const duration = 3; // 3 seconds

      const timing = estimateWordTiming(text, duration);

      expect(timing).toHaveLength(3);
      expect(timing[0].word).toBe('Hello');
      expect(timing[0].startTime).toBeCloseTo(0, 2);
      expect(timing[1].word).toBe('world');
      expect(timing[2].word).toBe('today');
      // Last word should end near duration
      expect(timing[2].endTime).toBeCloseTo(duration, 1);
    });

    it('should handle punctuation correctly', () => {
      const text = 'Hello, world! How are you?';
      const duration = 5;

      const timing = estimateWordTiming(text, duration);

      expect(timing).toHaveLength(5);
      expect(timing[0].word).toBe('Hello,');
      expect(timing[1].word).toBe('world!');
      expect(timing[2].word).toBe('How');
      expect(timing[3].word).toBe('are');
      expect(timing[4].word).toBe('you?');
    });

    it('should set correct character offsets', () => {
      const text = 'First second third';
      const duration = 3;

      const timing = estimateWordTiming(text, duration);

      expect(timing[0].charStart).toBe(0);
      expect(timing[0].charEnd).toBe(5);  // "First"
      expect(timing[1].charStart).toBe(6);
      expect(timing[1].charEnd).toBe(12); // "second"
      expect(timing[2].charStart).toBe(13);
      expect(timing[2].charEnd).toBe(18); // "third"
    });

    it('should handle multiple spaces and newlines', () => {
      const text = 'Hello   world\n\ntoday';
      const duration = 3;

      const timing = estimateWordTiming(text, duration);

      expect(timing).toHaveLength(3);
      expect(timing[0].charStart).toBe(0);  // "Hello"
      expect(timing[1].charStart).toBe(8);  // "world" after "Hello   "
      expect(timing[2].charStart).toBe(15); // "today" after "\n\n"
    });

    it('should handle empty text', () => {
      const timing = estimateWordTiming('', 5);
      expect(timing).toHaveLength(0);
    });

    it('should handle zero duration', () => {
      const timing = estimateWordTiming('Hello world', 0);
      expect(timing).toHaveLength(0);
    });

    it('should handle single word', () => {
      const text = 'Hello';
      const duration = 1;

      const timing = estimateWordTiming(text, duration);

      expect(timing).toHaveLength(1);
      expect(timing[0].word).toBe('Hello');
      expect(timing[0].startTime).toBe(0);
      expect(timing[0].endTime).toBe(1);
    });

    it('should handle long text with consistent timing', () => {
      const text = 'The quick brown fox jumps over the lazy dog and runs away into the forest';
      const duration = 10;

      const timing = estimateWordTiming(text, duration);

      expect(timing).toHaveLength(15);

      // Check timing is monotonically increasing
      for (let i = 1; i < timing.length; i++) {
        expect(timing[i].startTime).toBeGreaterThanOrEqual(timing[i - 1].endTime - 0.01);
      }

      // Check all words are within duration
      for (const word of timing) {
        expect(word.startTime).toBeGreaterThanOrEqual(0);
        expect(word.endTime).toBeLessThanOrEqual(duration + 0.01);
      }
    });
  });

  describe('estimateWordTimingByWPM', () => {
    it('should scale timing to match actual duration', () => {
      const text = 'One two three four five six';
      const duration = 4;

      const timing = estimateWordTimingByWPM(text, duration);

      expect(timing).toHaveLength(6);
      // Last word should end at duration
      expect(timing[5].endTime).toBeCloseTo(duration, 2);
    });

    it('should vary word duration based on length', () => {
      const text = 'A internationalization B';
      const duration = 3;

      const timing = estimateWordTimingByWPM(text, duration);

      expect(timing).toHaveLength(3);
      // Longer word should have longer duration
      const shortWordDuration = timing[0].endTime - timing[0].startTime;
      const longWordDuration = timing[1].endTime - timing[1].startTime;
      expect(longWordDuration).toBeGreaterThan(shortWordDuration);
    });

    it('should handle empty text', () => {
      const timing = estimateWordTimingByWPM('', 5);
      expect(timing).toHaveLength(0);
    });

    it('should produce monotonically increasing times', () => {
      const text = 'This is a test of the timing system';
      const duration = 5;

      const timing = estimateWordTimingByWPM(text, duration);

      for (let i = 1; i < timing.length; i++) {
        expect(timing[i].startTime).toBeGreaterThanOrEqual(timing[i - 1].startTime);
      }
    });
  });

  describe('findWordIndexAtTime', () => {
    it('should find correct word at given time', () => {
      const timing = [
        { word: 'Hello', startTime: 0, endTime: 1 },
        { word: 'world', startTime: 1, endTime: 2 },
        { word: 'today', startTime: 2, endTime: 3 },
      ];

      expect(findWordIndexAtTime(timing, 0)).toBe(0);
      expect(findWordIndexAtTime(timing, 0.5)).toBe(0);
      expect(findWordIndexAtTime(timing, 1)).toBe(1);
      expect(findWordIndexAtTime(timing, 1.5)).toBe(1);
      expect(findWordIndexAtTime(timing, 2)).toBe(2);
      expect(findWordIndexAtTime(timing, 2.9)).toBe(2);
    });

    it('should return -1 for time before first word', () => {
      const timing = [
        { word: 'Hello', startTime: 0.5, endTime: 1 },
      ];

      expect(findWordIndexAtTime(timing, 0.2)).toBe(-1);
    });

    it('should return last word index for time at end', () => {
      const timing = [
        { word: 'Hello', startTime: 0, endTime: 1 },
        { word: 'world', startTime: 1, endTime: 2 },
      ];

      expect(findWordIndexAtTime(timing, 2)).toBe(1);
    });

    it('should return -1 for empty timing array', () => {
      expect(findWordIndexAtTime([], 1)).toBe(-1);
    });

    it('should handle large timing arrays efficiently', () => {
      const timing = Array.from({ length: 1000 }, (_, i) => ({
        word: `word${i}`,
        startTime: i * 0.1,
        endTime: (i + 1) * 0.1,
      }));

      // Should use binary search, so this should be fast
      const startTime = performance.now();
      expect(findWordIndexAtTime(timing, 50)).toBe(500);
      expect(findWordIndexAtTime(timing, 75)).toBe(750);
      expect(findWordIndexAtTime(timing, 99)).toBe(990);
      const endTime = performance.now();

      // Should complete in under 10ms even with 1000 elements
      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe('estimateSegmentTiming', () => {
    it('should adjust character offsets for segment position', () => {
      const segmentText = 'Second segment here';
      const segmentDuration = 2;
      const segmentStartOffset = 50; // Segment starts at char 50 in full text

      const timing = estimateSegmentTiming(segmentText, segmentDuration, segmentStartOffset);

      expect(timing).toHaveLength(3);
      // First word should be at offset 50, not 0
      expect(timing[0].charStart).toBe(50);
      expect(timing[0].charEnd).toBe(56); // "Second" is 6 chars
    });

    it('should produce timing relative to segment audio', () => {
      const segmentText = 'This is segment';
      const segmentDuration = 3;

      const timing = estimateSegmentTiming(segmentText, segmentDuration, 100);

      // Timing should start at 0 for segment audio
      expect(timing[0].startTime).toBe(0);
      // But char offsets should be adjusted
      expect(timing[0].charStart).toBe(100);
    });

    it('should work with zero offset', () => {
      const segmentText = 'First segment';
      const segmentDuration = 2;

      const timing = estimateSegmentTiming(segmentText, segmentDuration, 0);

      expect(timing[0].charStart).toBe(0);
    });
  });

  describe('Integration: Timing for TTS providers without native timing', () => {
    it('should produce usable timing for word highlighting', () => {
      // Simulate a paragraph that would be sent to Gemini TTS
      const text = `The advancement of artificial intelligence has revolutionized many aspects of modern life.
From healthcare to transportation, AI systems are increasingly becoming integral to our daily routines.`;
      const duration = 15; // 15 seconds of audio

      const timing = estimateWordTiming(text, duration);

      // Should have all words
      expect(timing.length).toBeGreaterThan(20);

      // Each word should have valid timing
      for (const word of timing) {
        expect(word.startTime).toBeGreaterThanOrEqual(0);
        expect(word.endTime).toBeLessThanOrEqual(duration);
        expect(word.startTime).toBeLessThan(word.endTime);
        expect(word.charStart).toBeGreaterThanOrEqual(0);
        expect(word.charEnd).toBeGreaterThan(word.charStart!);
      }

      // Can find words at various times
      const midTime = duration / 2;
      const midIndex = findWordIndexAtTime(timing, midTime);
      expect(midIndex).toBeGreaterThan(0);
      expect(midIndex).toBeLessThan(timing.length);
    });

    it('should handle segment-by-segment generation', () => {
      // Simulate generating audio for segments separately
      const _fullText = 'First paragraph here.\n\nSecond paragraph now.';
      const segments = [
        { text: 'First paragraph here.', startOffset: 0 },
        { text: 'Second paragraph now.', startOffset: 23 },
      ];

      const segmentDurations = [2, 2.5]; // Different durations per segment

      const allTimings = segments.map((seg, i) =>
        estimateSegmentTiming(seg.text, segmentDurations[i], seg.startOffset)
      );

      // First segment timing
      expect(allTimings[0]).toHaveLength(3);
      expect(allTimings[0][0].charStart).toBe(0);

      // Second segment timing should have adjusted offsets
      expect(allTimings[1]).toHaveLength(3);
      expect(allTimings[1][0].charStart).toBe(23);
      expect(allTimings[1][0].word).toBe('Second');

      // Timing within each segment should be independent
      expect(allTimings[0][0].startTime).toBe(0);
      expect(allTimings[1][0].startTime).toBe(0);
    });
  });
});
