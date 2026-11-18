import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from './Toast';
import type { Toast } from '@/types';

// Mock the store hooks
const mockToasts: Toast[] = [];
const mockRemoveToast = vi.fn();

vi.mock('@/stores', () => ({
  useUIState: () => ({
    toasts: mockToasts,
  }),
  useUIActions: () => ({
    removeToast: mockRemoveToast,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockToasts.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastContainer', () => {
  it('should render nothing when there are no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
  });

  it('should render toasts', () => {
    mockToasts.push(
      { id: 't1', type: 'success', message: 'File saved!' },
      { id: 't2', type: 'error', message: 'Upload failed' }
    );

    render(<ToastContainer />);

    expect(screen.getByText('File saved!')).toBeInTheDocument();
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('should render success toast with correct role', () => {
    mockToasts.push({ id: 't1', type: 'success', message: 'Done!' });

    render(<ToastContainer />);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Done!');
  });

  it('should render different toast types', () => {
    mockToasts.push(
      { id: 't1', type: 'success', message: 'Success' },
      { id: 't2', type: 'error', message: 'Error' },
      { id: 't3', type: 'warning', message: 'Warning' },
      { id: 't4', type: 'info', message: 'Info' }
    );

    render(<ToastContainer />);

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('should call removeToast when close button is clicked', () => {
    mockToasts.push({ id: 't1', type: 'info', message: 'Test' });

    render(<ToastContainer />);

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(mockRemoveToast).toHaveBeenCalledWith('t1');
  });

  it('should auto-dismiss toast after default duration', () => {
    mockToasts.push({ id: 't1', type: 'info', message: 'Auto close' });

    render(<ToastContainer />);

    expect(mockRemoveToast).not.toHaveBeenCalled();

    // Default duration is 5000ms
    vi.advanceTimersByTime(5000);
    expect(mockRemoveToast).toHaveBeenCalledWith('t1');
  });

  it('should auto-dismiss toast after custom duration', () => {
    mockToasts.push({ id: 't1', type: 'info', message: 'Quick', duration: 2000 });

    render(<ToastContainer />);

    vi.advanceTimersByTime(1999);
    expect(mockRemoveToast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockRemoveToast).toHaveBeenCalledWith('t1');
  });

  it('should not auto-dismiss when duration is 0', () => {
    mockToasts.push({ id: 't1', type: 'error', message: 'Persistent', duration: 0 });

    render(<ToastContainer />);

    vi.advanceTimersByTime(60000);
    expect(mockRemoveToast).not.toHaveBeenCalled();
  });
});
