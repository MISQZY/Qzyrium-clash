import { session } from 'electron'

/** Release Chromium cache and collect unused main-process objects after renderer destruction. */
export async function trimProcessMemory(): Promise<void> {
  // 1. Clear Chromium network/HTTP/image cache
  try {
    if (session?.defaultSession) {
      await session.defaultSession.clearCache().catch(() => {})
    }
  } catch {
    // Ignore cache clear error
  }

  // 2. Trigger V8 Garbage Collection in Main Process
  try {
    const v8 = await import('node:v8')
    v8.setFlagsFromString('--expose_gc')
    const vm = await import('node:vm')
    vm.runInNewContext('gc()')
  } catch {
    // Ignore GC error
  }
}
