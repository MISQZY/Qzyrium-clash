export async function runLatencyTests(nodes: string[], options: {
  concurrency: number
  signal: AbortSignal
  test: (name: string) => Promise<number>
  publish: (delays: Record<string, number>) => void
}): Promise<void> {
  const names = [...new Set(nodes)]
  const concurrency = Number.isFinite(options.concurrency) ? Math.max(1, Math.min(32, Math.floor(options.concurrency))) : 1
  let index = 0
  let batch: Record<string, number> = {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancelFlush = () => { clearTimeout(timer); timer = undefined }
  const flush = () => {
    cancelFlush()
    if (!options.signal.aborted && Object.keys(batch).length) options.publish(batch)
    batch = {}
  }
  options.signal.addEventListener('abort', cancelFlush, { once: true })
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, async () => {
      while (!options.signal.aborted && index < names.length) {
        const name = names[index++]
        let delay: number
        try { delay = await options.test(name) }
        catch { delay = -1 }
        if (options.signal.aborted) return
        batch[name] = delay
        timer ??= setTimeout(flush, 200)
      }
    }))
    flush()
  } finally {
    cancelFlush()
    options.signal.removeEventListener('abort', cancelFlush)
  }
}
