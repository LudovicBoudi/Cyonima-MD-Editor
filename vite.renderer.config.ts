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
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/]node_modules[\\/](@tiptap|prosemirror-)/.test(id)) return 'editor'
          if (/[\\/]node_modules[\\/](lowlight|highlight\.js)[\\/]/.test(id)) return 'syntax'
          if (/[\\/]node_modules[\\/](marked|turndown|js-yaml|devlop)[\\/]/.test(id)) return 'markdown'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          return 'vendor'
        }
      }
    }
  }
})
