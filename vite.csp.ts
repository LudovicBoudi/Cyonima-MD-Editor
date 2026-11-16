import type { Plugin } from 'vite'

/**
 * The development server needs WebSocket/HTTP connections for HMR. Production
 * builds keep `connect-src` restricted to the application itself and local
 * image files.
 */
export function cspPlugin(): Plugin {
  let development = false
  return {
    name: 'cyonima-csp',
    configResolved(config) {
      development = config.command === 'serve'
    },
    transformIndexHtml(html) {
      const connectSrc = development ? "'self' ws: http: local-file:" : "'self' local-file:"
      const frameSrc = development ? "'self' data: blob:" : "'none'"
      return html
        .replace('__CYONIMA_CONNECT_SRC__', connectSrc)
        .replace('__CYONIMA_FRAME_SRC__', frameSrc)
    }
  }
}
