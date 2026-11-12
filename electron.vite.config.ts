import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      // Split the largest dependency groups so the editor code, syntax
      // highlighting and Markdown conversion can be cached independently.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (/[\\/]node_modules[\\/](@tiptap|prosemirror-)/.test(id)) return 'editor'
            if (/[\\/]node_modules[\\/](lowlight|highlight\.js)[\\/]/.test(id)) {
              // Grammars stay in the dynamically imported highlighting chunk.
              if (/lowlight[\\/]lib[\\/]common\.js/.test(id)) return undefined
              if (/highlight\.js[\\/](lib|es)[\\/]languages[\\/]/.test(id)) return undefined
              return 'syntax'
            }
            if (/[\\/]node_modules[\\/](marked|turndown|js-yaml|devlop)[\\/]/.test(id)) return 'markdown'
            if (id.includes('node_modules/lucide-react')) return 'icons'
            return 'vendor'
          }
        }
      }
    }
  }
})
