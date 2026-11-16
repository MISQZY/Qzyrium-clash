const assert = require('node:assert/strict')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

async function run() {
  const { DEFAULT_SERVICE_CHECK_TARGETS: defaults, validateServiceCheckTargets: validate, canCheckProxyServices } = load('src/shared/service-check.ts')
  const custom = { id: 'custom', name: 'My service', url: 'https://example.com/check', expected: '200/204/301-302' }
  validate(defaults)
  validate([custom])
  validate([])
  for (const patch of [{ name: ' ' }, { url: 'http://example.com/' }, { url: 'https://user:secret@example.com/' },
    { url: 'https://example.com/#test' }, { url: 'not a URL' }, { expected: '' }, { expected: '200-100' },
    { expected: '600' }, { expected: '200/403 '.repeat(30) }, { id: '__bad id' }]) {
    assert.throws(() => validate([{ ...custom, ...patch }]), JSON.stringify(patch))
  }
  assert.throws(() => validate([custom, { ...custom, id: 'other' }]), /unique/)
  assert.throws(() => validate([custom, { ...custom, url: 'https://different.example/' }]), /duplicate/)
  assert.throws(() => validate(Array(33).fill(custom)), /list/)
  assert.equal(canCheckProxyServices({ type: 'VLESS' }), true)
  for (const node of [undefined, { type: 'Direct' }, { type: 'Reject' }, { type: 'Selector', all: ['host'] }]) {
    assert.equal(canCheckProxyServices(node), false)
  }
  const { normalizeSettings, mergeSettings, createSettingsSectionPatch, resetSettingsSection } = load('src/shared/settings-config.ts')
  const settings = normalizeSettings({})
  assert.deepEqual(settings.general.serviceCheckTargets, defaults, 'old installations receive defaults')
  const draft = structuredClone(settings)
  draft.general.serviceCheckTargets = [custom]
  const saved = mergeSettings(settings, createSettingsSectionPatch('settings', { form: draft }, settings))
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(saved))).general.serviceCheckTargets, [custom], 'custom services survive persistence/backup')
  assert.deepEqual(mergeSettings(settings, { general: { serviceCheckTargets: [] } }).general.serviceCheckTargets, [], 'empty list stays empty')
  assert.deepEqual(resetSettingsSection(saved, 'settings').general.serviceCheckTargets, defaults)
  const { validateIpcArguments } = load('src/main/ipc/argument-validation.ts')
  validateIpcArguments('app:update-settings', [{ general: { serviceCheckTargets: [custom] } }])
  assert.throws(() => validateIpcArguments('app:update-settings', [{ general: { serviceCheckTargets: [{ ...custom, expected: '*' }] } }]))

  const { checkProxyServices } = load('src/main/core/checkProxyServices.ts')
  const targets = Array.from({ length: 7 }, (_, i) => ({ ...custom, id: `service-${i}`, url: `https://service-${i}.example/` }))
  let active = 0, maximum = 0
  const calls = []
  const client = { async get(endpoint, options) {
    calls.push({ endpoint, options })
    if (!options) return { data: { extra: Object.fromEntries(targets.slice(0, 5).map((target, i) => [target.url, { alive: i !== 1 }])) } }
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    if (options.params.url === targets[2].url) throw new Error('timeout')
    return { data: { delay: 25 } }
  } }
  const results = await checkProxyServices(client, 'Host / #1', targets)
  assert.equal(maximum, 3)
  assert.deepEqual(results.map(result => result.status), ['available', 'rejected', 'unreachable', 'available', 'available', 'unknown', 'unknown'])
  assert.deepEqual(results.map(result => result.id), targets.map(target => target.id))
  assert.ok(calls.every(call => call.endpoint.startsWith('/proxies/Host%20%2F%20%231')))
  assert.equal(calls[0].options.params.expected, custom.expected)
  assert.equal(calls[0].options.params.timeout, 7000)
  assert.equal(calls[0].options.timeout, 8000)
  assert.equal(calls.length, targets.length + 1, 'custom list is used instead of built-in endpoints')
  const count = calls.length
  assert.deepEqual(await checkProxyServices(client, 'Host', []), [])
  assert.equal(calls.length, count, 'disabled checks make no requests')
  await assert.rejects(() => checkProxyServices({ get: async () => { throw new Error('core stopped') } }, 'Host', [custom]), /core stopped/)
  const { classifyServiceResponse: classify, checkServiceResponse } = load('src/main/core/service-response.ts')
  const content = { ...custom, kind: 'content', content: { source: 'text', available: 'Welcome', blocked: 'not available in your region' } }
  const response = body => ({ status: 200, url: custom.url, body })
  validate([content])
  assert.equal(classify(content, response('Welcome! Not available in your region')).status, 'blocked', 'block evidence overrides success text even on HTTP 200')
  assert.equal(classify(content, { ...response('Not available in your region'), status: 403 }).status, 'blocked', 'explicit block evidence also applies to HTTP errors')
  assert.equal(classify(content, response('WELCOME!')).status, 'available')
  assert.equal(classify(content, response('Unknown landing page')).status, 'unknown')
  assert.equal(classify(content, response('<html>Verify you are human</html>')).status, 'challenged')
  const json = { ...content, content: { source: 'json', path: 'data.allowed', available: 'true', blocked: 'false' } }
  validate([json])
  assert.equal(classify(json, response('{"data":{"allowed":true}}')).status, 'available')
  assert.equal(classify(json, response('{"data":{"allowed":false}}')).status, 'blocked')
  assert.equal(classify(json, response('{"data":{}}')).status, 'unknown')
  assert.equal(classify(json, response('not JSON')).status, 'unknown')
  assert.throws(() => validate([{ ...json, content: { ...json.content, path: '__proto__.allowed' } }]))
  const { REGIONAL_SERVICE_PRESETS } = load('src/shared/service-check.ts')
  const regional = preset => ({ ...REGIONAL_SERVICE_PRESETS[preset], id: `regional-${preset}`, kind: 'regional', preset })
  const legacy = regional('youtube-premium')
  const migrated = normalizeSettings({ general: { serviceCheckTargets: [legacy] } }).general.serviceCheckTargets[0]
  assert.equal(migrated.name, legacy.name)
  assert.equal(migrated.url, legacy.url)
  assert.equal(migrated.kind, 'http')
  assert.equal(migrated.preset, undefined)
  const youtube = regional('youtube-premium')
  assert.equal(classify(youtube, response('YouTube Premium is not available in your country')).status, 'blocked')
  assert.equal(classify(youtube, response('YouTube Premium: ad-free entertainment "countryCode":"NL"')).region, 'NL')
  assert.equal(classify(youtube, response('YouTube Premium: ad-free entertainment')).status, 'available')
  assert.equal(classify(youtube, response('YouTube Premium')).status, 'unknown', 'absence of refusal never proves availability')
  assert.equal(classify(youtube, { ...response('Access denied'), status: 403 }).status, 'unknown', 'HTTP 403 alone is not a regional block')
  assert.equal(classify(regional('chatgpt'), response('{"error":{"code":"unsupported_country"}}')).status, 'blocked')
  assert.equal(classify(regional('chatgpt'), response('{"cookie_consent_required":false}')).status, 'available')
  assert.equal(classify(regional('chatgpt'), response('<html>Sign in</html>')).status, 'unknown')
  const notebook = regional('notebooklm')
  assert.equal(classify(notebook, { ...response(''), url: 'https://notebooklm.google.com/?location=unsupported' }).status, 'blocked')
  assert.equal(classify(notebook, { ...response(''), url: 'https://accounts.google.com/v3/signin/identifier' }).status, 'available')
  assert.equal(classify(notebook, { ...response(''), url: 'https://unrelated.example/signin' }).status, 'unknown')
  const netflix = regional('netflix')
  const netflixResult = await checkServiceResponse(netflix, async url => url.endsWith('70143836')
    ? { status: 404, url, body: '' } : { status: 200, url: 'https://www.netflix.com/nl-en/title/80197526', body: '<meta property="og:video">' })
  assert.equal(netflixResult.status, 'restricted')
  assert.equal(netflixResult.region, 'NL')
  const blocks = await checkServiceResponse(netflix, async url => ({ status: 404, url, body: '' }))
  assert.equal(blocks.status, 'blocked')
  assert.throws(() => validate([{ ...youtube, url: 'https://arbitrary.example/' }]))
  assert.throws(() => validate([{ ...custom, kind: 'regional', preset: 'unknown' }]))
  const detailed = await checkProxyServices(null, 'Host', [content], async url => ({ status: 200, url, body: 'Welcome' }))
  assert.equal(detailed[0].status, 'available')

  const { createServiceRequest } = load('src/main/core/service-request.ts')
  const abort = new AbortController()
  let fetchCalls = 0
  const request = createServiceRequest(async url => {
    fetchCalls++
    return url.endsWith('/redirect') ? new Response('', { status: 302, headers: { location: '/final' } }) : new Response('ok')
  }, abort.signal)
  assert.equal((await request('https://test.example/redirect', true)).url, 'https://test.example/final')
  assert.equal((await request('https://test.example/redirect', false)).status, 302)
  assert.equal(fetchCalls, 3)
  await assert.rejects(() => createServiceRequest(async () => new Response('', { status: 302, headers: { location: 'http://unsafe.example/' } }), abort.signal)('https://test.example/'), /Unsafe/)
  await assert.rejects(() => createServiceRequest(async () => new Response('', { status: 302, headers: { location: '/loop' } }), abort.signal)('https://test.example/'), /redirects/)
  abort.abort()
  await assert.rejects(() => request('https://test.example/'), /abort/i)
  const { EventEmitter } = require('node:events')
  const nativeRequests = []
  const { createElectronServiceFetch } = load('src/main/core/service-fetch.ts', { electron: { net: { request(options) {
    const req = new EventEmitter()
    nativeRequests.push({ options, req })
    req.setHeader = () => {}
    req.abort = () => { req.aborted = true; req.emit('abort') }
    req.end = () => queueMicrotask(() => {
      if (options.url.endsWith('/stall')) return
      if (options.url.endsWith('/redirect')) { req.emit('redirect', 301, 'GET', 'https://native.example/final', {}); return }
      const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: { 'content-type': ['application/json'] } })
      req.emit('response', res)
      res.emit('data', Buffer.from('{"ok":true}'))
      res.emit('end')
    })
    return req
  } } } })
  const isolatedSession = { isolated: true }
  const nativeAbort = new AbortController()
  const nativeRequest = createServiceRequest(createElectronServiceFetch(isolatedSession), nativeAbort.signal)
  const nativeResponse = await nativeRequest('https://native.example/redirect')
  assert.equal(nativeResponse.url, 'https://native.example/final')
  assert.equal(nativeResponse.body, '{"ok":true}')
  assert.equal(nativeRequests.length, 2)
  assert.equal(nativeRequests[0].req.aborted, true, 'native redirect is captured before following another validated hop')
  assert.ok(nativeRequests.every(({ options }) => options.session === isolatedSession && options.useSessionCookies))
  const stalled = nativeRequest('https://native.example/stall')
  nativeAbort.abort()
  await assert.rejects(() => stalled, /abort/i)
  assert.equal(nativeRequests.at(-1).req.aborted, true, 'cancellation terminates the native request')
  const fs = require('node:fs/promises')
  const path = require('node:path')
  const dir = path.resolve('artifacts/service-check-config-check')
  const temp = path.join(dir, 'temporary')
  await fs.mkdir(temp, { recursive: true })
  const providerPath = path.join(dir, 'cache.yaml')
  await fs.writeFile(providerPath, 'proxies: []\n')
  const { buildServiceCheckConfig } = load('src/main/core/ServiceCheckProxy.ts')
  const probe = await buildServiceCheckConfig({
    'external-controller': '0.0.0.0:9090', 'mixed-port': 7890, tun: { enable: true }, rules: ['MATCH,DIRECT'],
    listeners: [{ port: 12345 }], 'proxy-providers': { cached: { type: 'http', path: 'cache.yaml', url: 'https://should-not-download.example/' } },
    'proxy-groups': [{ name: 'Existing', type: 'url-test' }]
  }, 'Provider host [NL]`1', 1234, dir, temp, { Existing: { now: 'Provider host [NL]`1' } })
  assert.deepEqual(probe.rules, ['MATCH,REJECT'])
  assert.deepEqual(probe.tun, { enable: false })
  assert.equal(probe['external-controller'], undefined)
  assert.equal(probe['mixed-port'], 0)
  assert.equal(probe.listeners.length, 1)
  assert.equal(probe.listeners[0].listen, '127.0.0.1')
  assert.equal(probe['proxy-providers'].cached.type, 'file')
  assert.equal(probe['proxy-providers'].cached.url, undefined)
  assert.equal(probe['proxy-providers'].cached['health-check'].enable, false)
  assert.equal(probe['proxy-groups'][0].type, 'select')
  assert.equal(probe['proxy-groups'][0]['empty-fallback'], 'REJECT')
  assert.equal(probe['proxy-groups'][0].filter, '^Provider host \\[NL\\]\\x601$')
  assert.equal(await fs.readFile(path.join(temp, probe['proxy-providers'].cached.path), 'utf8'), 'proxies: []\n')
  console.log('PASS: configurable services, persistence/reset/IPC validation, selected host routing, concurrency limit, HTTP verdicts and older-core fallback')
  console.log('PASS: regional block/anti-bot/unknown classification, Netflix restricted catalogue, text/JSON matching, bounded redirects and cancellation')
  console.log('PASS: isolated probe config, cached providers without downloads, exact host filters, frozen groups and REJECT fallback')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
