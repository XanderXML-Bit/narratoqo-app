import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showHandle?: boolean;
  showCloseButton?: boolean;
  children: React.ReactNode;
  /** Height in percentage of viewport (default: 90) */
  maxHeight?: number;
}

/**
 * Mobile-friendly bottom sheet component with swipe-to-dismiss.
 * Uses touch events for natural gesture handling.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  showHandle = true,
  showCloseButton = true,
  children,
  maxHeight = 90,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  // Close with animation
  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setDragOffset(0);
      onClose();
    }, 200);
  }, [isClosing, onClose]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    currentY.current = touch.clientY;
    const offset = Math.max(0, currentY.current - startY.current);
    setDragOffset(offset);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // If dragged more than 100px or 25% of sheet height, close it
    const sheetHeight = sheetRef.current?.offsetHeight || 0;
    const threshold = Math.min(100, sheetHeight * 0.25);

    if (dragOffset > threshold) {
      handleClose();
    } else {
      setDragOffset(0);
    }
  }, [dragOffset, handleClose]);

  useDialogFocus(sheetRef, isOpen, handleClose);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-60">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl ${
          isClosing ? 'animate-slide-down' : 'animate-slide-up'
        } bottom-sheet-content`}
        style={{
          maxHeight: `${maxHeight}vh`,
          transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          paddingBottom: 'var(--safe-area-bottom)',
        }}
      >
        {/* Drag handle */}
        {showHandle && (
          <div
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-10 h-1 bg-text-muted rounded-full" />
          </div>
        )}

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 pb-4">
            {title && (
              <h2 id={titleId} className="text-lg font-semibold text-text-primary">{title}</h2>
            )}
            {showCloseButton && (
              <button
                onClick={handleClose}
                className="touch-target text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: `calc(${maxHeight}vh - 80px)` }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
