// src/components/intelligence/ResultBoundary.jsx
//
// The app has no global error boundary, so any render error used to blank the
// whole page. This one wraps just the Intelligence result: if a response ever
// comes back in a shape the renderer can't draw, the owner sees a message and
// a Try again button (the tabs / period bar above stay usable) and the real
// error is logged to the console for debugging.
import React from 'react';
import AvyonBot from './AvyonBot';

export default class ResultBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Intelligence render error:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // switching tab / period / store clears the error so the new result gets a fresh try
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ix-error" role="alert">
        <AvyonBot mood="sad" size={120} title="Avyon, apologetic" />
        <div className="ix-error-copy">
          <h2>I could not draw that answer</h2>
          <p>Something in the result was not in a shape I could display{this.state.error?.message ? ` (${this.state.error.message})` : ''}.</p>
          <button
            type="button"
            className="ix-apply"
            onClick={() => { this.setState({ error: null }); this.props.onRetry?.(); }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}