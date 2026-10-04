import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../lib/monitoring';

interface Props {
  fallback: (reset: () => void) => ReactNode;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.reset) : this.props.children;
  }
}
