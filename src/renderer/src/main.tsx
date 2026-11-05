import ReactDOM from 'react-dom/client'
import App from './App'
import { installBrowserMock } from './lib/browserMock'
import { applyResolvedTheme, previewTheme } from './lib/theme'
import './styles.css'

installBrowserMock()
applyResolvedTheme(previewTheme())

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

ReactDOM.createRoot(container).render(<App />)
