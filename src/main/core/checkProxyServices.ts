import { validateServiceCheckTargets, type ServiceCheckTarget, type ServiceCheckResult, type ProxyIpInfo } from '@shared/service-check'
import type { AxiosInstance } from 'axios'
import { checkServiceResponse, fetchIpIntelligence, type ServiceRequest } from './service-response'

export async function checkProxyServices(client: AxiosInstance | null, name: string, targets: ServiceCheckTarget[], request?: ServiceRequest): Promise<ServiceCheckResult[]> {
  validateServiceCheckTargets(targets)
  if (!targets.length) return []
  const endpoint = `/proxies/${encodeURIComponent(name)}`
  const results: ServiceCheckResult[] = new Array(targets.length)

  let ipInfo: ProxyIpInfo | null = null
  if (request) {
    try {
      ipInfo = await fetchIpIntelligence(request)
    } catch {
      // Ignore IP intelligence fetch failure
    }
  }

  let cursor = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < targets.length) {
      const index = cursor++
      const target = targets[index]
      try {
        if (request) {
          const res = await checkServiceResponse(target, request)
          results[index] = ipInfo ? { ...res, ipInfo } : res
          continue
        }
        if (!client || (target.kind && target.kind !== 'http')) throw new Error('A response transport is required')
        const { data } = await client.get<{ delay: number }>(`${endpoint}/delay`, {
          params: { url: target.url, expected: target.expected, timeout: 7000 }, timeout: 8000
        })
        // Mihomo returns a delay even for unexpected HTTP status codes. The actual
        // status verdict is stored in extra[url].alive, not in the /delay response.
        results[index] = { id: target.id, status: 'unknown', delay: data.delay }
      } catch {
        results[index] = { id: target.id, status: 'unreachable', ...(ipInfo ? { ipInfo } : {}) }
      }
    }
  }))
  if (request) return results
  if (!client) throw new Error('Missing service check transport')
  const { data } = await client.get<{ extra?: Record<string, { alive?: boolean }> }>(endpoint)
  return results.map((result, index) => {
    if (result.status === 'unreachable') return result
    const alive = data.extra?.[targets[index].url]?.alive
    return { ...result, status: alive === true ? 'available' : alive === false ? 'rejected' : 'unknown' }
  })
}
