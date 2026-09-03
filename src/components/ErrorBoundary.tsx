import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import EditableContent from './EditableContent';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    console.error('ErrorBoundary caught an error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary details:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-neutral-700/20 rounded-lg p-8 text-center">
          <AlertTriangle size={48} className="text-error mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2"><EditableContent contentKey="error-boundary-noget-gik-galt" fallback="Noget gik galt" /></h3>
          <p className="text-neutral-400 mb-4">
            <EditableContent contentKey="error-boundary-der-opstod-en-fejl-ved" fallback="Der opstod en fejl ved indlæsning af denne sektion." /></p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
            className="btn-primary"
          >
            <EditableContent contentKey="error-boundary-proev-igen" fallback="Prøv igen" /></button>
          {this.state.error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-neutral-400">
                <EditableContent contentKey="error-boundary-fejldetaljer" fallback="Fejldetaljer" /></summary>
              <pre className="mt-2 text-xs bg-neutral-800 p-4 rounded overflow-auto">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;