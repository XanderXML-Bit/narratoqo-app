import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clean up any body style changes
    document.body.style.overflow = '';
  });

  it('should not render when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()}>
        <div>Content</div>
      </BottomSheet>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('should render children when open', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <div>Sheet Content</div>
      </BottomSheet>
    );

    expect(screen.getByText('Sheet Content')).toBeInTheDocument();
  });

  it('uses the title as the accessible name of the modal dialog', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="Settings">
        <div>Content</div>
      </BottomSheet>
    );

    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true');
  });

  it('should render close button by default', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="Test">
        <div>Content</div>
      </BottomSheet>
    );

    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('should hide close button when showCloseButton is false', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} showCloseButton={false}>
        <div>Content</div>
      </BottomSheet>
    );

    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Test">
        <div>Content</div>
      </BottomSheet>
    );

    fireEvent.click(screen.getByLabelText('Close'));

    // The close has a 200ms animation delay
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <BottomSheet isOpen={true} onClose={onClose}>
        <div>Content</div>
      </BottomSheet>
    );

    const backdrop = baseElement.querySelector('.bg-black\\/60');
    if (!backdrop) throw new Error('Missing sheet backdrop');
    fireEvent.click(backdrop);
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should close on Escape key', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose}>
        <div>Content</div>
      </BottomSheet>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should prevent body scroll when open', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </BottomSheet>
    );

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('should restore body scroll when closed', () => {
    const { unmount } = render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </BottomSheet>
    );

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('should apply custom maxHeight', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} maxHeight={50}>
        <div>Content</div>
      </BottomSheet>
    );

    expect(screen.getByRole('dialog')).toHaveStyle({ maxHeight: '50vh' });
  });
});
