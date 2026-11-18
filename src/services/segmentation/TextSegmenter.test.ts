import { describe, it, expect } from 'vitest';
import {
  segmentText,
  paginateSegments,
  getPageForSegment,
  getPreloadSegments,
  hasReadableText,
  findNextReadableSegment,
  type TextSegment,
} from './TextSegmenter';

describe('segmentText', () => {
  it('should segment short text into single segment', () => {
    const text = 'This is a short paragraph.';
    const segments = segmentText(text, 'test-project');

    expect(segments.length).toBe(1);
    expect(segments[0].text).toBe(text);
    expect(segments[0].type).toBe('paragraph');
  });

  it('should split paragraphs correctly', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const segments = segmentText(text, 'test-project');

    expect(segments.length).toBe(3);
    expect(segments[0].text).toBe('First paragraph.');
    expect(segments[1].text).toBe('Second paragraph.');
    expect(segments[2].text).toBe('Third paragraph.');
  });

  it('should detect dialogue', () => {
    const text = '"Hello there!" said John.';
    const segments = segmentText(text, 'test-project');

    expect(segments[0].type).toBe('dialogue');
  });

  it('should split long paragraphs into sentences', () => {
    // Create a paragraph longer than MAX_SEGMENT_LENGTH (1000 chars)
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `This is sentence number ${i + 1} with some additional text to make it longer.`
    );
    const longParagraph = sentences.join(' ');
    const segments = segmentText(longParagraph, 'test-project');

    expect(segments.length).toBeGreaterThan(1);
    segments.forEach(seg => {
      expect(seg.text.length).toBeLessThanOrEqual(1000);
    });
  });

  it('should assign unique IDs to segments', () => {
    const text = 'First.\n\nSecond.\n\nThird.';
    const segments = segmentText(text, 'test-project');

    const ids = segments.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should set hasAudio and isGenerating to false initially', () => {
    const text = 'Some text here.';
    const segments = segmentText(text, 'test-project');

    segments.forEach(seg => {
      expect(seg.hasAudio).toBe(false);
      expect(seg.isGenerating).toBe(false);
    });
  });

  it('should set correct indices', () => {
    const text = 'First.\n\nSecond.\n\nThird.';
    const segments = segmentText(text, 'test-project');

    segments.forEach((seg, idx) => {
      expect(seg.index).toBe(idx);
    });
  });
});

describe('paginateSegments', () => {
  const createSegments = (count: number): TextSegment[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `seg-${i}`,
      index: i,
      text: `Segment ${i}`,
      startOffset: 0,
      endOffset: 10,
      type: 'paragraph' as const,
      hasAudio: false,
      isGenerating: false,
    }));
  };

  it('should create correct number of pages', () => {
    const segments = createSegments(12);
    const pages = paginateSegments(segments, 5);

    expect(pages.length).toBe(3);
    expect(pages[0].segments.length).toBe(5);
    expect(pages[1].segments.length).toBe(5);
    expect(pages[2].segments.length).toBe(2);
  });

  it('should handle single page', () => {
    const segments = createSegments(3);
    const pages = paginateSegments(segments, 5);

    expect(pages.length).toBe(1);
    expect(pages[0].segments.length).toBe(3);
  });

  it('should set correct page indices', () => {
    const segments = createSegments(10);
    const pages = paginateSegments(segments, 5);

    expect(pages[0].pageIndex).toBe(0);
    expect(pages[1].pageIndex).toBe(1);
  });

  it('should set correct segment ranges', () => {
    const segments = createSegments(12);
    const pages = paginateSegments(segments, 5);

    expect(pages[0].startSegmentIndex).toBe(0);
    expect(pages[0].endSegmentIndex).toBe(4);
    expect(pages[1].startSegmentIndex).toBe(5);
    expect(pages[1].endSegmentIndex).toBe(9);
    expect(pages[2].startSegmentIndex).toBe(10);
    expect(pages[2].endSegmentIndex).toBe(11);
  });
});

describe('getPageForSegment', () => {
  it('should return correct page for segment', () => {
    expect(getPageForSegment(0, 5)).toBe(0);
    expect(getPageForSegment(4, 5)).toBe(0);
    expect(getPageForSegment(5, 5)).toBe(1);
    expect(getPageForSegment(9, 5)).toBe(1);
    expect(getPageForSegment(10, 5)).toBe(2);
  });
});

describe('getPreloadSegments', () => {
  const createSegments = (count: number, audioUpTo: number = -1): TextSegment[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `seg-${i}`,
      index: i,
      text: `Segment ${i}`,
      startOffset: 0,
      endOffset: 10,
      type: 'paragraph' as const,
      hasAudio: i <= audioUpTo,
      isGenerating: false,
    }));
  };

  it('should return next segments without audio', () => {
    const segments = createSegments(10);
    const toPreload = getPreloadSegments(0, segments, 2);

    expect(toPreload.length).toBe(2);
    expect(toPreload[0].index).toBe(1);
    expect(toPreload[1].index).toBe(2);
  });

  it('should skip segments with audio', () => {
    const segments = createSegments(10, 2); // segments 0-2 have audio
    const toPreload = getPreloadSegments(0, segments, 3);

    // Preload looks at next N segments (1, 2, 3) - skips 1 and 2 since they have audio
    // Only segment 3 is returned since it's the only one without audio in the preload window
    expect(toPreload.length).toBe(1);
    expect(toPreload[0].index).toBe(3);
  });

  it('should not return segments past end', () => {
    const segments = createSegments(5);
    const toPreload = getPreloadSegments(3, segments, 5);

    expect(toPreload.length).toBe(1);
    expect(toPreload[0].index).toBe(4);
  });

  it('should return empty array at last segment', () => {
    const segments = createSegments(5);
    const toPreload = getPreloadSegments(4, segments, 2);

    expect(toPreload.length).toBe(0);
  });
});

describe('hasReadableText', () => {
  it('should return true for text with letters', () => {
    expect(hasReadableText('Hello world')).toBe(true);
    expect(hasReadableText('abc')).toBe(true);
    expect(hasReadableText('Test 123')).toBe(true);
  });

  it('should return false for text without letters', () => {
    expect(hasReadableText('123')).toBe(false);
    expect(hasReadableText('...')).toBe(false);
    expect(hasReadableText('   ')).toBe(false);
    expect(hasReadableText('!@#$%')).toBe(false);
    expect(hasReadableText('')).toBe(false);
  });

  it('should handle unicode letters', () => {
    expect(hasReadableText('日本語')).toBe(true);
    expect(hasReadableText('café')).toBe(true);
    expect(hasReadableText('über')).toBe(true);
    expect(hasReadableText('中文')).toBe(true);
  });

  it('should return true for mixed content with at least one letter', () => {
    expect(hasReadableText('123a456')).toBe(true);
    expect(hasReadableText('... x ...')).toBe(true);
  });
});

describe('findNextReadableSegment', () => {
  const createMixedSegments = (): TextSegment[] => [
    { id: 'seg-0', index: 0, text: 'Hello world', startOffset: 0, endOffset: 11, type: 'paragraph', hasAudio: false, isGenerating: false },
    { id: 'seg-1', index: 1, text: '...', startOffset: 12, endOffset: 15, type: 'paragraph', hasAudio: false, isGenerating: false },
    { id: 'seg-2', index: 2, text: '123', startOffset: 16, endOffset: 19, type: 'paragraph', hasAudio: false, isGenerating: false },
    { id: 'seg-3', index: 3, text: 'Readable text', startOffset: 20, endOffset: 33, type: 'paragraph', hasAudio: false, isGenerating: false },
    { id: 'seg-4', index: 4, text: '!!!', startOffset: 34, endOffset: 37, type: 'paragraph', hasAudio: false, isGenerating: false },
    { id: 'seg-5', index: 5, text: 'Another readable', startOffset: 38, endOffset: 54, type: 'paragraph', hasAudio: false, isGenerating: false },
  ];

  it('should find next readable segment forward', () => {
    const segments = createMixedSegments();

    // From index 0, next readable is 3 (skips 1 and 2)
    expect(findNextReadableSegment(segments, 0, 'forward')).toBe(3);

    // From index 3, next readable is 5 (skips 4)
    expect(findNextReadableSegment(segments, 3, 'forward')).toBe(5);
  });

  it('should find next readable segment backward', () => {
    const segments = createMixedSegments();

    // From index 5, previous readable is 3 (skips 4)
    expect(findNextReadableSegment(segments, 5, 'backward')).toBe(3);

    // From index 3, previous readable is 0 (skips 2 and 1)
    expect(findNextReadableSegment(segments, 3, 'backward')).toBe(0);
  });

  it('should return -1 when no readable segment found forward', () => {
    const segments = createMixedSegments();

    // From index 5, no more readable segments forward
    expect(findNextReadableSegment(segments, 5, 'forward')).toBe(-1);
  });

  it('should return -1 when no readable segment found backward', () => {
    const segments = createMixedSegments();

    // From index 0, no readable segments backward
    expect(findNextReadableSegment(segments, 0, 'backward')).toBe(-1);
  });

  it('should work with all readable segments', () => {
    const segments: TextSegment[] = [
      { id: 'seg-0', index: 0, text: 'First', startOffset: 0, endOffset: 5, type: 'paragraph', hasAudio: false, isGenerating: false },
      { id: 'seg-1', index: 1, text: 'Second', startOffset: 6, endOffset: 12, type: 'paragraph', hasAudio: false, isGenerating: false },
      { id: 'seg-2', index: 2, text: 'Third', startOffset: 13, endOffset: 18, type: 'paragraph', hasAudio: false, isGenerating: false },
    ];

    expect(findNextReadableSegment(segments, 0, 'forward')).toBe(1);
    expect(findNextReadableSegment(segments, 1, 'forward')).toBe(2);
    expect(findNextReadableSegment(segments, 2, 'backward')).toBe(1);
  });

  it('should work with all non-readable segments', () => {
    const segments: TextSegment[] = [
      { id: 'seg-0', index: 0, text: '...', startOffset: 0, endOffset: 3, type: 'paragraph', hasAudio: false, isGenerating: false },
      { id: 'seg-1', index: 1, text: '123', startOffset: 4, endOffset: 7, type: 'paragraph', hasAudio: false, isGenerating: false },
      { id: 'seg-2', index: 2, text: '!!!', startOffset: 8, endOffset: 11, type: 'paragraph', hasAudio: false, isGenerating: false },
    ];

    expect(findNextReadableSegment(segments, 0, 'forward')).toBe(-1);
    expect(findNextReadableSegment(segments, 2, 'backward')).toBe(-1);
  });
});
