import { describe, it, expect } from 'vitest';
import {
  hasReadableText,
  findNextReadableSegment,
  segmentText,
  paginateSegments,
  getPageForSegment,
  getPreloadSegments,
  type TextSegment,
} from './TextSegmenter';

describe('hasReadableText edge cases', () => {
  it('returns false for empty string', () => {
    expect(hasReadableText('')).toBe(false);
  });

  it('returns false for only numbers', () => {
    expect(hasReadableText('12345')).toBe(false);
  });

  it('returns false for only punctuation', () => {
    expect(hasReadableText('...---!!!')).toBe(false);
  });

  it('returns false for only whitespace', () => {
    expect(hasReadableText('   \n\t  ')).toBe(false);
  });

  it('returns true for Unicode text', () => {
    expect(hasReadableText('日本語')).toBe(true);
    expect(hasReadableText('Ñoño')).toBe(true);
    expect(hasReadableText('Привет')).toBe(true);
  });

  it('returns true for text mixed with numbers', () => {
    expect(hasReadableText('Test123')).toBe(true);
  });
});

describe('findNextReadableSegment edge cases', () => {
  const makeSegment = (index: number, text: string): TextSegment => ({
    id: `seg-${index}`,
    index,
    text,
    startOffset: 0,
    endOffset: text.length,
    type: 'paragraph',
    hasAudio: false,
    isGenerating: false,
  });

  it('returns -1 for empty segments array', () => {
    expect(findNextReadableSegment([], 0, 'forward')).toBe(-1);
  });

  it('skips non-readable segments going forward', () => {
    const segments = [
      makeSegment(0, 'Hello'),
      makeSegment(1, '---'),
      makeSegment(2, '...'),
      makeSegment(3, 'World'),
    ];
    expect(findNextReadableSegment(segments, 0, 'forward')).toBe(3);
  });

  it('skips non-readable segments going backward', () => {
    const segments = [
      makeSegment(0, 'Hello'),
      makeSegment(1, '---'),
      makeSegment(2, '...'),
      makeSegment(3, 'World'),
    ];
    expect(findNextReadableSegment(segments, 3, 'backward')).toBe(0);
  });

  it('returns -1 when no readable segment found forward', () => {
    const segments = [
      makeSegment(0, 'Hello'),
      makeSegment(1, '---'),
      makeSegment(2, '...'),
    ];
    expect(findNextReadableSegment(segments, 0, 'forward')).toBe(-1);
  });

  it('returns -1 when no readable segment found backward', () => {
    const segments = [
      makeSegment(0, '---'),
      makeSegment(1, '...'),
      makeSegment(2, 'Hello'),
    ];
    expect(findNextReadableSegment(segments, 2, 'backward')).toBe(-1);
  });
});

describe('segmentText edge cases', () => {
  it('preserves repeated Unicode paragraph offsets and project-scoped IDs', () => {
    const text = '  Café 日本語.\r\n\r\n\tCafé 日本語.  ';
    const segments = segmentText(text, 'project-a');
    expect(segments.map(s => s.startOffset)).toEqual([2, text.lastIndexOf('Café')]);
    segments.forEach((segment, index) => {
      expect(text.slice(segment.startOffset, segment.endOffset)).toBe(segment.text);
      expect(segment.id).toBe(`project-a-seg-${index}`);
    });
    expect(segmentText(text, 'project-b').map(s => s.id))
      .toEqual(['project-b-seg-0', 'project-b-seg-1']);
  });

  it('preserves exact source spans when long repeated sentences have irregular whitespace', () => {
    const sentence = 'This repeated sentence has enough words to form natural reading segments.';
    const text = `  ${Array(20).fill(sentence).join(' \t\n  ')}  `;
    const segments = segmentText(text, 'project');
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.map(s => s.text).join(' ').replace(/\s+/g, ' '))
      .toBe(text.trim().replace(/\s+/g, ' '));
    segments.forEach((segment, index) => {
      expect(text.slice(segment.startOffset, segment.endOffset)).toBe(segment.text);
      if (index > 0) expect(segment.startOffset).toBeGreaterThanOrEqual(segments[index - 1].endOffset);
    });
    expect(segments.at(-1)?.endOffset).toBe(text.trimEnd().length);
  });

  it('keeps a short opening sentence before an oversized sentence', () => {
    const text = `Intro. ${'A long sentence without a break '.repeat(40)}ends. Done.`;
    const segments = segmentText(text, 'project');
    expect(segments.map(s => s.text).join(' ')).toBe(text);
    expect(segments[0].text).toBe('Intro.');
    segments.forEach(segment => {
      expect(text.slice(segment.startOffset, segment.endOffset)).toBe(segment.text);
    });
  });

  it('handles empty text', () => {
    const result = segmentText('', 'test');
    expect(result).toHaveLength(0);
  });

  it('handles whitespace-only text', () => {
    const result = segmentText('   \n\n   ', 'test');
    expect(result).toHaveLength(0);
  });

  it('handles single short paragraph', () => {
    const result = segmentText('Hello world, this is a test.', 'test');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].text).toContain('Hello world');
  });

  it('handles dialogue detection', () => {
    const text = '"Hello," she said.\n\n"Hi there," he replied.';
    const result = segmentText(text, 'test');
    const dialogueSegments = result.filter(s => s.type === 'dialogue');
    expect(dialogueSegments.length).toBeGreaterThan(0);
  });

  it('handles very long paragraph splitting', () => {
    // Create a very long paragraph (>1000 chars)
    const longParagraph = Array(50).fill('This is a long sentence that repeats. ').join('');
    const result = segmentText(longParagraph, 'test');
    expect(result.length).toBeGreaterThan(1);
  });

  it('assigns sequential indexes', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const result = segmentText(text, 'test');
    result.forEach((seg, i) => {
      expect(seg.index).toBe(i);
    });
  });

  it('generates unique IDs', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const result = segmentText(text, 'test');
    const ids = new Set(result.map(s => s.id));
    expect(ids.size).toBe(result.length);
  });

  it('handles duplicate sentences in long paragraph correctly', () => {
    // Bug fix: indexOf was finding the FIRST occurrence of duplicate sentences
    // Each repeated sentence should get its own correct offset
    const repeated = 'This sentence repeats. ';
    const longParagraph = repeated.repeat(50); // >1000 chars, triggers sentence splitting
    const result = segmentText(longParagraph, 'test');

    // All segments should have non-empty text
    for (const seg of result) {
      expect(seg.text.trim().length).toBeGreaterThan(0);
    }

    // Segments should have sequential indexes
    result.forEach((seg, i) => {
      expect(seg.index).toBe(i);
    });

    // Total text should roughly cover the original
    const totalText = result.map(s => s.text).join(' ');
    expect(totalText).toContain('This sentence repeats');
  });

  it('does not drop short remainder when no previous segment exists', () => {
    // Bug fix: if the only "sentence" in a long paragraph was < MIN_SEGMENT_LENGTH
    // and segments was empty, it would be silently dropped
    // Create a paragraph that's > MAX_SEGMENT_LENGTH but splits into one short sentence
    const longText = 'A. '.repeat(400); // >1000 chars, many tiny sentences
    const result = segmentText(longText, 'test');

    // Should produce at least one segment (nothing dropped)
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('paginateSegments edge cases', () => {
  const makeSegments = (count: number): TextSegment[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `seg-${i}`,
      index: i,
      text: `Segment ${i}`,
      startOffset: 0,
      endOffset: 10,
      type: 'paragraph' as const,
      hasAudio: false,
      isGenerating: false,
    }));

  it('handles empty segments', () => {
    expect(paginateSegments([], 5)).toHaveLength(0);
  });

  it('handles fewer segments than page size', () => {
    const pages = paginateSegments(makeSegments(3), 5);
    expect(pages).toHaveLength(1);
    expect(pages[0].segments).toHaveLength(3);
  });

  it('handles exact page size', () => {
    const pages = paginateSegments(makeSegments(5), 5);
    expect(pages).toHaveLength(1);
    expect(pages[0].segments).toHaveLength(5);
  });

  it('handles one more than page size', () => {
    const pages = paginateSegments(makeSegments(6), 5);
    expect(pages).toHaveLength(2);
    expect(pages[0].segments).toHaveLength(5);
    expect(pages[1].segments).toHaveLength(1);
  });

  it('sets correct startSegmentIndex and endSegmentIndex', () => {
    const pages = paginateSegments(makeSegments(12), 5);
    expect(pages[0].startSegmentIndex).toBe(0);
    expect(pages[0].endSegmentIndex).toBe(4);
    expect(pages[1].startSegmentIndex).toBe(5);
    expect(pages[1].endSegmentIndex).toBe(9);
    expect(pages[2].startSegmentIndex).toBe(10);
    expect(pages[2].endSegmentIndex).toBe(11);
  });
});

describe('getPageForSegment', () => {
  it('returns 0 for first page segments', () => {
    expect(getPageForSegment(0, 5)).toBe(0);
    expect(getPageForSegment(4, 5)).toBe(0);
  });

  it('returns correct page for later segments', () => {
    expect(getPageForSegment(5, 5)).toBe(1);
    expect(getPageForSegment(10, 5)).toBe(2);
  });
});

describe('getPreloadSegments', () => {
  const makeSegments = (count: number): TextSegment[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `seg-${i}`,
      index: i,
      text: `Segment ${i}`,
      startOffset: 0,
      endOffset: 10,
      type: 'paragraph' as const,
      hasAudio: false,
      isGenerating: false,
    }));

  it('returns next segments that need audio', () => {
    const segments = makeSegments(5);
    const result = getPreloadSegments(0, segments, 2);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(1);
    expect(result[1].index).toBe(2);
  });

  it('skips segments that already have audio', () => {
    const segments = makeSegments(5);
    segments[1].hasAudio = true;
    const result = getPreloadSegments(0, segments, 2);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(2);
  });

  it('skips segments that are generating', () => {
    const segments = makeSegments(5);
    segments[1].isGenerating = true;
    const result = getPreloadSegments(0, segments, 2);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(2);
  });

  it('returns empty array at end of segments', () => {
    const segments = makeSegments(3);
    const result = getPreloadSegments(2, segments, 2);
    expect(result).toHaveLength(0);
  });

  it('handles preloadCount of 0', () => {
    const segments = makeSegments(3);
    const result = getPreloadSegments(0, segments, 0);
    expect(result).toHaveLength(0);
  });
});
