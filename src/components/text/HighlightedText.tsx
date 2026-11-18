import { memo } from 'react';
import type { WordTiming } from '@/types';

export interface HighlightedTextProps {
  timing: WordTiming[];
  currentWordIndex: number;
  onWordClick: (index: number, timing: WordTiming) => void;
}

/** Word-by-word highlighted text displayed inside segment cards. */
export const HighlightedText = memo(function HighlightedText({
  timing,
  currentWordIndex,
  onWordClick,
}: HighlightedTextProps) {
  if (timing.length === 0) {
    return null;
  }

  return (
    <p className="text-base leading-relaxed text-text-primary pr-8">
      {timing.map((word, index) => {
        const isCurrentWord = index === currentWordIndex;
        const isPastWord = index < currentWordIndex;

        return (
          <span
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(index, word);
            }}
            className={`cursor-pointer transition-all duration-100 ${
              isCurrentWord
                ? 'bg-accent/50 text-text-primary rounded px-0.5 font-medium'
                : isPastWord
                ? 'text-text-muted'
                : 'text-text-primary hover:bg-surface-dark/50'
            }`}
          >
            {word.word}{' '}
          </span>
        );
      })}
    </p>
  );
});

/** Inline word-by-word highlighting for continuous reading view (no wrapper <p>). */
export const ContinuousHighlightedText = memo(function ContinuousHighlightedText({
  timing,
  currentWordIndex,
  onWordClick,
}: HighlightedTextProps) {
  if (timing.length === 0) {
    return null;
  }

  return (
    <>
      {timing.map((word, index) => {
        const isCurrentWord = index === currentWordIndex;
        const isPastWord = index < currentWordIndex;

        return (
          <span
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(index, word);
            }}
            className={`cursor-pointer transition-all duration-100 ${
              isCurrentWord
                ? 'bg-accent/50 text-text-primary rounded px-0.5 font-medium'
                : isPastWord
                ? 'text-text-muted'
                : 'text-text-primary hover:bg-surface-dark/50'
            }`}
          >
            {word.word}{' '}
          </span>
        );
      })}
    </>
  );
});
