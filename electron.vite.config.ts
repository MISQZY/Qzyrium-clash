import { resolve } from 'path'
import { randomBytes } from 'node:crypto'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const devNonce = randomBytes(32).toString('base64')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    build: {
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                return 'vendor-react'
              }
              if (id.includes('lucide-react') || id.includes('@tabler/icons-react')) {
                return 'vendor-icons'
              }
              if (id.includes('radix-ui') || id.includes('@radix-ui')) {
                return 'vendor-ui'
              }
            }
          }
        }
      }
    },
    root: resolve('src/renderer'),
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      {
        name: 'renderer-dev-csp',
        apply: 'serve',
        config: () => ({ html: { cspNonce: devNonce } }),
        transformIndexHtml: (html) => html
          .replace("script-src 'self'", `script-src 'self' 'nonce-${devNonce}'`)
          .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173")
      },
      react(),
      tailwindcss()
    ]
  }
})
