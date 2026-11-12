import { Component } from 'react'
import type { ContextType, ErrorInfo, ReactNode } from 'react'
import { I18nContext } from '../lib/i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Prevents a render error in the editor from turning the whole window blank.
 * The document on disk is never touched by a render crash, so the fallback can
 * offer a simple reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static contextType = I18nContext
  declare context: ContextType<typeof I18nContext>
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      window.api.log('error', 'Erreur de rendu', {
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack
      })
    } catch {
      // The logging channel itself must never throw.
    }
    console.error('ErrorBoundary', error, info)
  }

  render(): ReactNode {
    const { t } = this.context
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <h1>{t('error.title')}</h1>
            <p>{t('error.body')}</p>
            <pre className="error-boundary-detail">{this.state.error.message}</pre>
            <button type="button" className="error-boundary-action" onClick={() => window.location.reload()}>
              {t('error.reload')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
