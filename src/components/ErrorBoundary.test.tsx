import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, ViewErrorBoundary } from './ErrorBoundary';

// Suppress React error boundary console output during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function ThrowingComponent({ error }: { error?: Error }) {
  if (error) throw error;
  return <div>Working content</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders fallback UI on error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Test crash')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows error message in technical details', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Specific error msg')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Specific error msg')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent error={new Error('crash')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('Try Again button resets the error boundary', () => {
    let shouldThrow = true;
    function ConditionalThrow() {
      if (shouldThrow) throw new Error('test');
      return <div>Recovered</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));

    rerender(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('shows Reload App button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('crash')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Reload App')).toBeInTheDocument();
  });
});

describe('ViewErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ViewErrorBoundary viewName="Test">
        <div>Child content</div>
      </ViewErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('shows compact error with view name on crash', () => {
    render(
      <ViewErrorBoundary viewName="Settings">
        <ThrowingComponent error={new Error('crash')} />
      </ViewErrorBoundary>
    );
    expect(screen.getByText('Settings failed to load')).toBeInTheDocument();
    expect(screen.getByText('Reload')).toBeInTheDocument();
  });

  it('shows generic message when no viewName', () => {
    render(
      <ViewErrorBoundary>
        <ThrowingComponent error={new Error('crash')} />
      </ViewErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
