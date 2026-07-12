import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error?.message || 'An unexpected error occurred'
    const isDev = import.meta.env.DEV

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--surface-page, #0F172A)' }}
      >
        <div
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{ background: 'var(--surface-card, #1E293B)', border: '1px solid var(--border, rgba(255,255,255,.08))' }}
        >
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(239,68,68,.12)' }}
          >
            <AlertTriangle className="h-8 w-8" style={{ color: '#EF4444' }} />
          </div>

          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary, #F8FAFC)' }}>
            Something went wrong
          </h1>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted, #64748B)' }}>
            The application encountered an unexpected error.
          </p>

          {isDev && (
            <pre
              className="text-left text-xs mt-4 mb-4 p-3 rounded-lg overflow-auto max-h-32"
              style={{ background: 'rgba(239,68,68,.06)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,.2)' }}
            >
              {msg}
            </pre>
          )}

          <button
            onClick={this.reset}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand-primary)' }}
          >
            <RefreshCw className="h-4 w-4" />
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }
}
