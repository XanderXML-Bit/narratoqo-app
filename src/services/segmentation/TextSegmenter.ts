/**
 * Text segmentation utility for breaking text into natural reading segments.
 * Segments are designed to be read aloud as coherent units.
 */

export interface TextSegment {
  id: string;
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  type: 'paragraph' | 'sentence' | 'dialogue';
  hasAudio: boolean;
  isGenerating: boolean;
}

export interface SegmentPage {
  pageIndex: number;
  segments: TextSegment[];
  startSegmentIndex: number;
  endSegmentIndex: number;
}

// Target segment length for TTS (characters)
const TARGET_SEGMENT_LENGTH = 500;
const MAX_SEGMENT_LENGTH = 1000;
const MIN_SEGMENT_LENGTH = 50;

/**
 * Check if text contains readable content (actual words, not just punctuation/numbers/whitespace).
 * Returns true if text has at least one alphabetic character.
 */
export function hasReadableText(text: string): boolean {
  // Check for at least one alphabetic character (supports Unicode letters)
  return /\p{L}/u.test(text);
}

/**
 * Find the next segment index that has readable text.
 * Returns -1 if no readable segment is found.
 */
export function findNextReadableSegment(
  segments: TextSegment[],
  fromIndex: number,
  direction: 'forward' | 'backward' = 'forward'
): number {
  const step = direction === 'forward' ? 1 : -1;
  let index = fromIndex + step;

  while (index >= 0 && index < segments.length) {
    if (hasReadableText(segments[index].text)) {
      return index;
    }
    index += step;
  }

  return -1;
}

/**
 * Split text into natural segments for reading.
 * Prioritizes paragraph breaks, then sentence breaks.
 */
export function segmentText(text: string, projectId: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let segmentIndex = 0;

  // First, split by paragraphs (double newlines or single newlines with content)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  let currentOffset = 0;

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();

    // Find the actual offset in original text
    const paraStart = text.indexOf(trimmedPara, currentOffset);

    // Check if paragraph is dialogue (starts with quote)
    const isDialogue = /^["'\u201c\u201d\u2018\u2019]/.test(trimmedPara);

    // If paragraph is short enough, keep it as one segment
    if (trimmedPara.length <= MAX_SEGMENT_LENGTH) {
      segments.push({
        id: `${projectId}-seg-${segmentIndex}`,
        index: segmentIndex,
        text: trimmedPara,
        startOffset: paraStart,
        endOffset: paraStart + trimmedPara.length,
        type: isDialogue ? 'dialogue' : 'paragraph',
        hasAudio: false,
        isGenerating: false,
      });
      segmentIndex++;
    } else {
      // Split long paragraphs into sentences
      const sentences = splitIntoSentences(trimmedPara);
      const firstParagraphSegment = segments.length;
      let segmentStart = 0;
      let segmentEnd = 0;
      let sentenceSearchOffset = 0; // Track offset to handle duplicate sentences

      const saveSegment = () => {
        segments.push({
          id: `${projectId}-seg-${segmentIndex}`,
          index: segmentIndex++,
          text: trimmedPara.slice(segmentStart, segmentEnd),
          startOffset: paraStart + segmentStart,
          endOffset: paraStart + segmentEnd,
          type: isDialogue ? 'dialogue' : 'sentence',
          hasAudio: false,
          isGenerating: false,
        });
      };

      for (const sentence of sentences) {
        // Find sentence offset incrementally to handle duplicate sentences correctly
        const sentencePos = trimmedPara.indexOf(sentence, sentenceSearchOffset);
        const resolvedPos = sentencePos !== -1 ? sentencePos : sentenceSearchOffset;
        sentenceSearchOffset = resolvedPos + sentence.length;

        const sentenceEnd = resolvedPos + sentence.length;
        if (segmentEnd > segmentStart && sentenceEnd - segmentStart > TARGET_SEGMENT_LENGTH) {
          // Keep short sentences too: dropping them loses spoken content.
          saveSegment();
          segmentStart = resolvedPos;
        } else if (segmentEnd === segmentStart) {
          segmentStart = resolvedPos;
        }
        segmentEnd = sentenceEnd;
      }

      // Merge a short remainder only within this paragraph, preserving its source span.
      if (segmentEnd - segmentStart < MIN_SEGMENT_LENGTH && segments.length > firstParagraphSegment) {
        const lastSeg = segments[segments.length - 1];
        lastSeg.endOffset = paraStart + segmentEnd;
        lastSeg.text = text.slice(lastSeg.startOffset, lastSeg.endOffset);
      } else if (segmentEnd > segmentStart) {
        saveSegment();
      }
    }

    currentOffset = paraStart + trimmedPara.length;
  }

  return segments;
}

/**
 * Split text into sentences using common punctuation.
 */
function splitIntoSentences(text: string): string[] {
  // Match sentences ending with .!? followed by space and capital letter or end of string
  // Also handles quotes and parentheses
  const sentenceRegex = /[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g;
  const matches = text.match(sentenceRegex) || [text];

  return matches
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Organize segments into pages for display.
 * Ensures segments are not split across pages.
 */
export function paginateSegments(
  segments: TextSegment[],
  segmentsPerPage: number = 5
): SegmentPage[] {
  const pages: SegmentPage[] = [];

  for (let i = 0; i < segments.length; i += segmentsPerPage) {
    const pageSegments = segments.slice(i, i + segmentsPerPage);
    pages.push({
      pageIndex: pages.length,
      segments: pageSegments,
      startSegmentIndex: i,
      endSegmentIndex: Math.min(i + segmentsPerPage - 1, segments.length - 1),
    });
  }

  return pages;
}

/**
 * Find which page a segment belongs to.
 */
export function getPageForSegment(
  segmentIndex: number,
  segmentsPerPage: number = 5
): number {
  return Math.floor(segmentIndex / segmentsPerPage);
}

/**
 * Get segments that should be preloaded (next N segments after current).
 */
export function getPreloadSegments(
  currentSegmentIndex: number,
  segments: TextSegment[],
  preloadCount: number = 2
): TextSegment[] {
  const preloadSegments: TextSegment[] = [];

  for (let i = 1; i <= preloadCount; i++) {
    const nextIndex = currentSegmentIndex + i;
    if (nextIndex < segments.length && !segments[nextIndex].hasAudio && !segments[nextIndex].isGenerating) {
      preloadSegments.push(segments[nextIndex]);
    }
  }

  return preloadSegments;
}
