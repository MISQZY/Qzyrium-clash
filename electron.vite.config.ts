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
    build: { minify: 'esbuild' },
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
        name: 'monaco-patched-dompurify',
        enforce: 'pre',
        async resolveId(source, importer) {
          // Monaco vendors a copy; updating only its npm dependency leaves that copy in the renderer.
          if (source === './dompurify/dompurify.js' && importer?.replaceAll('\\', '/').endsWith('/monaco-editor/esm/vs/base/browser/domSanitize.js')) {
            return this.resolve('dompurify', importer, { skipSelf: true })
          }
        }
      },
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
