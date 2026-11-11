import { useEffect, useRef, useState } from 'react'
import type { ProxyNode } from '@shared/mihomo'
import { runLatencyTests } from '../lib/latency-tests'

export function useProxyLatency(options: {
  running: boolean
  proxies: Record<string, ProxyNode>
  delays?: Record<string, number>
  onUpdateDelays?: (delays: Record<string, number>) => void
  concurrency: number
}) {
  const [localDelays, setLocalDelays] = useState<Record<string, number>>({})
  const [testing, setTesting] = useState<{ group: string | null; all: boolean }>({ group: null, all: false })
  const pending = useRef<AbortController | null>(null)
  const publish = useRef(options.onUpdateDelays)
  publish.current = options.onUpdateDelays

  useEffect(() => {
    setTesting({ group: null, all: false })
    return () => { pending.current?.abort(); pending.current = null }
  }, [options.running, options.proxies])

  const test = async (nodes: string[], group: string | null) => {
    if (!options.running || !window.api || pending.current || !nodes.length) return
    const controller = new AbortController()
    pending.current = controller
    setTesting({ group, all: group === null })
    try {
      await runLatencyTests(nodes, {
        concurrency: options.concurrency, signal: controller.signal,
        test: name => window.api.mihomo.testDelay(name),
        publish: updates => {
          if (publish.current) publish.current(updates)
          else setLocalDelays(previous => ({ ...previous, ...updates }))
        }
      })
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setTesting({ group: null, all: false })
      }
    }
  }

  return { delays: options.delays ?? localDelays, testingGroup: testing.group, testingAll: testing.all,
    testGroup: (group: string, nodes: string[]) => test(nodes, group), testAll: (nodes: string[]) => test(nodes, null) }
}
