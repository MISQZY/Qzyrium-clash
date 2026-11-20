import { useEffect, useRef, useState } from 'react'
import type { ProxyNode } from '@shared/mihomo'
import { createLatencyTestPool, runLatencyTests } from '../lib/latency-tests'

const idleTesting = () => ({ groups: new Set<string>(), all: false, nodes: new Set<string>() })

function hasCatalogChanged(prev: Record<string, unknown>, curr: Record<string, unknown>): boolean {
  if (prev === curr) return false
  const prevKeys = Object.keys(prev)
  const currKeys = Object.keys(curr)
  if (prevKeys.length === 0 || currKeys.length === 0) return true
  if (prevKeys.length !== currKeys.length) return true
  for (let i = 0; i < currKeys.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(prev, currKeys[i])) return true
  }
  return false
}

type TestSession = {
  controller: AbortController
  test: (name: string) => Promise<number>
  jobs: Map<string | null, Set<string>>
}

export function useProxyLatency(options: {
  running: boolean
  proxies: Record<string, ProxyNode>
  delays?: Record<string, number>
  onUpdateDelays?: (delays: Record<string, number>) => void
  concurrency: number
}) {
  const [localDelays, setLocalDelays] = useState<Record<string, number>>({})
  const [testing, setTesting] = useState(idleTesting)
  const pending = useRef<TestSession | null>(null)
  const publish = useRef(options.onUpdateDelays)
  publish.current = options.onUpdateDelays
  const catalogRef = useRef(options.proxies)

  useEffect(() => {
    if (!options.running) {
      pending.current?.controller.abort()
      pending.current = null
      setTesting(idleTesting())
    }
  }, [options.running])

  useEffect(() => {
    if (hasCatalogChanged(catalogRef.current, options.proxies)) {
      catalogRef.current = options.proxies
      pending.current?.controller.abort()
      pending.current = null
      setTesting(idleTesting())
    } else {
      catalogRef.current = options.proxies
    }
  }, [options.proxies])

  useEffect(() => {
    return () => {
      pending.current?.controller.abort()
      pending.current = null
    }
  }, [options.concurrency])

  const updateTesting = (session: TestSession) => {
    setTesting({
      groups: new Set([...session.jobs.keys()].filter((group): group is string => group !== null)),
      all: session.jobs.has(null),
      nodes: new Set([...session.jobs.values()].flatMap(nodes => [...nodes]))
    })
  }

  const test = async (nodes: string[], group: string | null) => {
    if (!window.api || !nodes.length) return
    if (!pending.current) {
      const controller = new AbortController()
      pending.current = {
        controller, jobs: new Map(),
        test: createLatencyTestPool({ concurrency: options.concurrency, signal: controller.signal,
          test: name => window.api.mihomo.testDelay(name) })
      }
    }
    const session = pending.current
    if (session.jobs.has(group) || session.jobs.has(null) || (group === null && session.jobs.size)) return
    const remaining = new Set(nodes)
    session.jobs.set(group, remaining)
    updateTesting(session)
    try {
      await runLatencyTests(nodes, {
        concurrency: options.concurrency, signal: session.controller.signal,
        test: session.test,
        publish: updates => {
          if (publish.current) publish.current(updates)
          else setLocalDelays(previous => ({ ...previous, ...updates }))
          for (const name of Object.keys(updates)) remaining.delete(name)
          updateTesting(session)
        }
      })
    } finally {
      if (pending.current === session) {
        session.jobs.delete(group)
        updateTesting(session)
        if (!session.jobs.size) pending.current = null
      }
    }
  }

  return { delays: options.delays ?? localDelays, testingNodes: testing.nodes, testingGroups: testing.groups, testingAll: testing.all,
    testGroup: (group: string, nodes: string[]) => test(nodes, group), testAll: (nodes: string[]) => test(nodes, null) }
}
