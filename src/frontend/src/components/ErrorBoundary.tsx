import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: string;
}

/**
 * Last line of defence against the "blank screen" failure mode.
 *
 * Without this, any exception thrown during render makes React unmount the
 * whole tree and the user stares at an empty page with no clue what broke.
 * With it, the crash is surfaced with the actual error so it can be fixed
 * (and reported) instead of being mistaken for a network problem.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, info: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
    this.setState({ info: info.componentStack || '' });
  }

  handleReset = () => {
    this.setState({ error: null, info: '' });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-arcade-bg text-arcade-text flex items-center justify-center p-4">
        <div className="max-w-xl w-full retro-window p-6 space-y-5">
          <div className="text-5xl">🛑</div>
          <div className="space-y-2">
            <h1 className="font-pixel text-[11px] text-arcade-red uppercase leading-relaxed">
              Interface Crash
            </h1>
            <p className="text-sm text-arcade-muted font-term text-base leading-snug">
              The room UI hit an unexpected error and was stopped to protect your session. Nothing
              was sent to the server — the relay still only ever saw ciphertext.
            </p>
          </div>

          <div className="retro-inset p-3 space-y-2">
            <div className="font-pixel text-[8px] text-arcade-yellow uppercase">Error</div>
            <pre className="font-mono text-[11px] text-arcade-red whitespace-pre-wrap break-words">
              {error.message || String(error)}
            </pre>
            {info && (
              <pre className="font-mono text-[10px] text-arcade-muted whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {info.trim().split('\n').slice(0, 12).join('\n')}
              </pre>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button className="retro-btn retro-btn-green flex-1" onClick={this.handleReset}>
              TRY AGAIN
            </button>
            <button
              className="retro-btn retro-btn-cyan flex-1"
              onClick={() => window.location.reload()}
            >
              RELOAD APP
            </button>
          </div>
        </div>
      </div>
    );
  }
}
