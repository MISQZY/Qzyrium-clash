const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

async function verify() {
  const requests = []
  const { MihomoApiClient } = load('src/main/core/MihomoApiClient.ts', {
    axios: { create: () => ({
      get: async url => {
        requests.push(url)
        return { data: { providers: url.endsWith('rules')
          ? { rules: { vehicleType: 'HTTP', ruleCount: 42, payload: 'private rules' } }
          : { nodes: { vehicleType: 'HTTP', updatedAt: '2026-11-14T12:00:00Z', proxies: [{ name: 'private', password: 'secret' }], url: 'https://private.invalid/token' } } } }
      },
      put: async (...args) => { requests.push(args) }
    }) }
  })
  const api = new MihomoApiClient()
  assert.deepEqual(await api.getProviders('proxies'), [{ name: 'nodes', vehicleType: 'HTTP', updatedAt: '2026-11-14T12:00:00Z', itemCount: 1 }])
  assert.equal((await api.getProviders('rules'))[0].itemCount, 42)
  await api.updateProvider('rules', 'Source / #1?')
  assert.deepEqual(requests.at(-1), ['/providers/rules/Source%20%2F%20%231%3F'])
  await api.reloadConfig('/work/config.yaml')
  assert.deepEqual(requests.at(-1), ['/configs?force=true', { path: '/work/config.yaml' }])

  const { KernelService } = load('src/main/services/KernelService.ts', { electron: { powerMonitor: new EventEmitter() } })
  let state = 'stopped', updates = 0
  const kernel = Object.assign(Object.create(KernelService.prototype), {
    lifecycle: Promise.resolve(), processManager: { getState: () => state }, invalidateGlobe() {},
    apiClient: { getProviders: async () => [{ name: 'remote', vehicleType: 'HTTP' }, { name: 'local', vehicleType: 'File' }],
      updateProvider: async () => { updates++ } }
  })
  assert.deepEqual(await kernel.getProviders('proxies'), [])
  const deadline = setTimeout(() => { console.error('Provider lifecycle did not settle'); process.exit(1) }, 5000)
  try {
    await assert.rejects(kernel.updateProvider('rules', 'remote'), /Start the VPN core/)
    let continued = false
    await kernel.enqueueLifecycle(async () => { continued = true })
    assert.equal(continued, true, 'rejected offline update must not block subsequent lifecycle operations')
  } finally { clearTimeout(deadline) }
  state = 'running'
  for (const name of ['missing', 'local']) await assert.rejects(kernel.updateProvider('rules', name), /cannot be updated/)
  await kernel.updateProvider('rules', 'remote')
  assert.equal(updates, 1)
  console.log('PASS: provider metadata isolation, encoded names, API contracts and guarded updates without implicit core startup')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
