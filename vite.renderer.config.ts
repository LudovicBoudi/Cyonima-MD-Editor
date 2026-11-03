import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Renderer-only Vite config. Handy to preview the interface in a regular
 * browser (a development mock replaces the Electron preload API).
 */
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  }
})
