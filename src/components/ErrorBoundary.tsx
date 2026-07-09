/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  name: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in ${this.props.name}:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-red-500 dark:border-red-400 p-6 neo-shadow dark:neo-shadow-dark flex flex-col items-center gap-4 select-none">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
            <h3 className="font-display font-black text-lg uppercase text-red-600 dark:text-red-400">
              {this.props.name} Crashed
            </h3>
          </div>
          <p className="font-sans text-sm text-gray-600 dark:text-gray-300 text-center max-w-md">
            Something went wrong while rendering this section. The rest of the app is still working.
          </p>
          {this.state.error && (
            <code className="font-mono text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded border border-red-200 dark:border-red-800 max-w-full overflow-x-auto whitespace-pre-wrap break-all">
              {this.state.error.message}
            </code>
          )}
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white border-2 border-black font-display font-bold text-xs uppercase hover:bg-red-600 neo-shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
