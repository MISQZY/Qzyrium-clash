import { resolve } from 'path'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const devNonce = randomBytes(32).toString('base64')
// Embed exact build inputs in app.asar; never trust a writable sidecar hash file.
const executableInputs = {
  core: resolve('extra/sidecar', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'),
  runner: resolve('extra/files/qzyrium-run.exe'),
  watchdog: resolve('extra/files/qzyrium-watchdog.exe')
}
const executablePins = Object.fromEntries(Object.entries(executableInputs)
  .filter(([, filename]) => existsSync(filename))
  .map(([role, filename]) => [role, createHash('sha256').update(readFileSync(filename)).digest('hex')]))
const resourceLock = JSON.parse(readFileSync(resolve('scripts/resources.lock.json'), 'utf8'))
const pinnedCore = resourceLock.mihomo.targets[`${process.platform}-${process.arch}`]?.sha256
if (executablePins.core && executablePins.core !== pinnedCore) throw new Error('Bundled core does not match resources.lock.json; run prepare:resources')

export default defineConfig({
  main: {
    define: { __QZYRIUM_EXECUTABLE_PINS__: JSON.stringify(executablePins) },
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
            const moduleId = id.replace(/\\/g, '/')
            if (moduleId.includes('node_modules/')) {
              // Match package directories: a substring match also pulls
              // @uiw/react-codemirror and its editor dependencies into startup.
              if (/\/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) {
                return 'vendor-react'
              }
              if (/\/node_modules\/(lucide-react|@tabler\/icons-react)\//.test(moduleId)) {
                return 'vendor-icons'
              }
              if (/\/node_modules\/(radix-ui|@radix-ui\/[^/]+)\//.test(moduleId)) {
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
