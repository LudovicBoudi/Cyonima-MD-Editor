import ReactDOM from 'react-dom/client'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { installBrowserMock } from './lib/browserMock'
import { applyResolvedTheme, previewTheme } from './lib/theme'
import './styles.css'

installBrowserMock()
applyResolvedTheme(previewTheme())

// Opt-in crash reports: the main process drops these unless the user enabled
// them, and strips paths before writing anything.
window.addEventListener('error', (event) => {
  void window.api.reportCrash({
    source: 'renderer',
    name: event.error instanceof Error ? event.error.name : undefined,
    message: event.error instanceof Error ? event.error.message : event.message,
    stack: event.error instanceof Error ? event.error.stack : undefined
  }).catch(() => undefined)
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  void window.api.reportCrash({
    source: 'renderer',
    name: reason instanceof Error ? reason.name : undefined,
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  }).catch(() => undefined)
})

// Benchmark/diagnostic marker: the delay from navigation to React mount.
performance.mark('cyonima:renderer-boot')

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

ReactDOM.createRoot(container).render(
  <I18nProvider>
    <App />
  </I18nProvider>
)
