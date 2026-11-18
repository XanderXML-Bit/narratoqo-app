import { Component, type ReactNode, type FC } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Label shown in the compact view-level error UI */
  viewName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary component that catches React rendering errors
 * and displays a fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crash caught by ErrorBoundary:', error);
    console.error('Component stack:', info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <AlertTriangle className="w-16 h-16 text-error mx-auto" />
            </div>

            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Something went wrong
            </h1>

            <p className="text-text-secondary mb-6">
              An unexpected error occurred. Your data is safe, but you'll need to reload the app.
            </p>

            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-text-muted hover:text-text-secondary">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-surface rounded-lg text-xs text-error overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-surface text-text-primary rounded-lg hover:bg-surface-light transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight error boundary for individual views/sections.
 * Shows a compact inline error instead of a full-page crash screen.
 */
export const ViewErrorBoundary: FC<{ children: ReactNode; viewName?: string }> = ({ children, viewName }) => (
  <ErrorBoundary
    fallback={
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-error mb-3" />
        <h3 className="text-lg font-semibold text-text-primary mb-1">
          {viewName ? `${viewName} failed to load` : 'Something went wrong'}
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          An error occurred in this section. Try reloading the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Reload
        </button>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);
