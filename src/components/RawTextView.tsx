import { useRef, useEffect, useMemo, memo } from 'react';
import type { GlobalTimingMap, GlobalTimingWord } from '@/services/audio/AudioExporter';

// Flat word type with segment context
interface FlatWord extends GlobalTimingWord {
  segmentIndex: number;
  flatIndex: number;
}

// Word component props
interface WordProps {
  word: FlatWord;
  isActive: boolean;
  isPast: boolean;
  onClick: () => void;
}

// Memoized Word component - only re-renders when isActive/isPast changes
const Word = memo(function Word({ word, isActive, isPast, onClick }: WordProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`cursor-pointer transition-all duration-100 ${
        isActive
          ? 'bg-accent/50 text-text-primary rounded px-0.5 font-medium'
          : isPast
            ? 'text-text-muted'
            : 'text-text-primary hover:bg-surface-dark/50'
      }`}
      aria-label={`Seek to word: ${word.word}`}
    >
      {word.word}{' '}
    </span>
  );
});

/**
 * Binary search to find word at given global time.
 * O(log n) instead of O(n) linear search.
 */
function findWordAtTime(words: FlatWord[], time: number): number {
  if (words.length === 0) return -1;

  let low = 0;
  let high = words.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const word = words[mid];

    // Check if time falls within this word's range
    if (time >= word.globalStart && time < word.globalEnd) {
      return mid;
    }

    // Check if we're in a gap before next word
    if (mid < words.length - 1) {
      const nextWord = words[mid + 1];
      if (time >= word.globalEnd && time < nextWord.globalStart) {
        // In gap - return current word as "just passed"
        return mid;
      }
    }

    if (time < word.globalStart) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // If time is past the last word, return last word
  if (words.length > 0 && time >= words[words.length - 1].globalEnd) {
    return words.length - 1;
  }

  return -1;
}

interface RawTextViewProps {
  /** The original text content (unsegmented) */
  originalContent: string;
  /** Timing map for word-level highlighting in full audio mode */
  timingMap?: GlobalTimingMap;
  /** Current global time in full audio playback */
  currentGlobalTime?: number;
  /** Whether full audio mode is active */
  isFullAudioMode?: boolean;
  /** Callback when user clicks a position in the text (returns approximate global time) */
  onSeek?: (globalTime: number) => void;
}

/**
 * RawTextView renders the original text content without any segment indicators.
 * Used for:
 * 1. Pure reading mode - just the text, no segment numbers
 * 2. Full audio mode - word highlighting across the entire text
 */
export function RawTextView({
  originalContent,
  timingMap,
  currentGlobalTime = 0,
  isFullAudioMode = false,
  onSeek,
}: RawTextViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentWordRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to current word during playback
  useEffect(() => {
    if (isFullAudioMode && currentWordRef.current) {
      currentWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [isFullAudioMode, currentGlobalTime]);

  // Memoize the flat word list to avoid rebuilding on every render
  const allWords = useMemo<FlatWord[]>(() => {
    if (!timingMap) return [];

    const words: FlatWord[] = [];
    let flatIndex = 0;
    for (const segment of timingMap.segments) {
      for (const word of segment.words) {
        words.push({
          ...word,
          segmentIndex: segment.segmentIndex,
          flatIndex: flatIndex++,
        });
      }
    }
    return words;
  }, [timingMap]);

  // Use binary search for O(log n) word lookup instead of O(n) linear search
  const currentWordIndex = useMemo(() => {
    if (!isFullAudioMode || allWords.length === 0) return -1;
    return findWordAtTime(allWords, currentGlobalTime);
  }, [isFullAudioMode, allWords, currentGlobalTime]);

  // If no timing map or not in full audio mode, render plain text
  if (!isFullAudioMode || !timingMap) {
    return (
      <div ref={containerRef} className="max-w-3xl mx-auto">
        <div className="prose prose-lg prose-invert max-w-none leading-relaxed text-text-primary whitespace-pre-wrap">
          {originalContent}
        </div>
      </div>
    );
  }

  // Handle word click for seeking
  const handleWordClick = (wordIndex: number) => {
    if (onSeek && allWords[wordIndex]) {
      onSeek(allWords[wordIndex].globalStart);
    }
  };

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto">
      <div className="prose prose-lg prose-invert max-w-none leading-relaxed text-text-primary">
        {allWords.map((word, index) => {
          const isActive = index === currentWordIndex;
          const isPast = index < currentWordIndex;

          return (
            <span
              key={word.flatIndex}
              ref={isActive ? currentWordRef : null}
            >
              <Word
                word={word}
                isActive={isActive}
                isPast={isPast}
                onClick={() => handleWordClick(index)}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default RawTextView;
