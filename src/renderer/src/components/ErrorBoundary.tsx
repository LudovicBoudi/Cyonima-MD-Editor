import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

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
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <h1>Quelque chose s’est mal passé</h1>
            <p>
              Une erreur inattendue est survenue dans l’éditeur. Vos documents sur le disque ne
              sont pas affectés.
            </p>
            <pre className="error-boundary-detail">{this.state.error.message}</pre>
            <button type="button" className="error-boundary-action" onClick={() => window.location.reload()}>
              Recharger l’éditeur
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
