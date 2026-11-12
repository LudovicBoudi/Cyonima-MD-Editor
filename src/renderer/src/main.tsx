import ReactDOM from 'react-dom/client'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { installBrowserMock } from './lib/browserMock'
import { applyResolvedTheme, previewTheme } from './lib/theme'
import './styles.css'

installBrowserMock()
applyResolvedTheme(previewTheme())

// Benchmark/diagnostic marker: the delay from navigation to React mount.
performance.mark('cyonima:renderer-boot')

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

ReactDOM.createRoot(container).render(
  <I18nProvider>
    <App />
  </I18nProvider>
)
