'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          <h2 style={{ color: '#ff4757', marginBottom: '16px' }}>Oops, something went wrong.</h2>
          <p style={{ color: '#8b949e', fontSize: '12px', marginBottom: '24px' }}>
            We caught an error in RiskGuardia.
          </p>
          <pre style={{ textAlign: 'left', background: '#090909', padding: '16px', borderRadius: '8px', border: '1px solid #1a1c24', overflow: 'auto', fontSize: '11px', color: '#ff4757' }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ marginTop: '24px', padding: '10px 20px', background: '#FDC800', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase' }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
