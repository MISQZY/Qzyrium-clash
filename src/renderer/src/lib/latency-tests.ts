const testConcurrency = (value: number) => Number.isFinite(value) ? Math.max(1, Math.min(32, Math.floor(value))) : 1

/** Share the request budget and in-flight node tests between concurrently tested groups. */
export function createLatencyTestPool(options: {
  concurrency: number
  signal: AbortSignal
  test: (name: string) => Promise<number>
}): (name: string) => Promise<number> {
  const concurrency = testConcurrency(options.concurrency)
  const pending = new Map<string, Promise<number>>()
  const queue: { name: string; resolve: (delay: number) => void }[] = []
  let active = 0
  const drain = () => {
    while (!options.signal.aborted && active < concurrency && queue.length) {
      const job = queue.shift()!
      active++
      void (async () => {
        let delay: number
        try { delay = await options.test(job.name) }
        catch { delay = -1 }
        active--
        pending.delete(job.name)
        job.resolve(delay)
        drain()
      })()
    }
  }
  options.signal.addEventListener('abort', () => {
    for (const job of queue.splice(0)) {
      pending.delete(job.name)
      job.resolve(-1)
    }
  }, { once: true })
  return name => {
    if (options.signal.aborted) return Promise.resolve(-1)
    const existing = pending.get(name)
    if (existing) return existing
    let resolve!: (delay: number) => void
    const promise = new Promise<number>(done => { resolve = done })
    pending.set(name, promise)
    queue.push({ name, resolve })
    drain()
    return promise
  }
}

export async function runLatencyTests(nodes: string[], options: {
  concurrency: number
  signal: AbortSignal
  test: (name: string) => Promise<number>
  publish: (delays: Record<string, number>) => void
}): Promise<void> {
  const names = [...new Set(nodes)]
  const concurrency = testConcurrency(options.concurrency)
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
