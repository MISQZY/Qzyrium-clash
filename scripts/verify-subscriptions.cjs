const assert = require('node:assert/strict')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

const { isValidRemoteSubscriptionUrl: valid, isAllowedSubscriptionAddress: allowed, sanitizeUrl } =
  load('src/main/utils/subscription-url.ts')

for (const url of [
  'http://127.0.0.1/sub', 'http://127.0.0.2/sub', 'http://127.255.255.255/sub',
  'http://127.1/sub', 'http://2130706433/sub', 'http://0x7f000002/sub', 'http://0177.0.0.2/sub',
  'http://0.0.0.0/sub', 'http://0.1.2.3/sub', 'http://[::]/sub', 'http://[::1]/sub',
  'http://[0:0:0:0:0:0:0:1]/sub', 'http://[::ffff:127.0.0.2]/sub',
  'http://[::ffff:7f00:1]/sub', 'http://[::127.0.0.1]/sub',
  'http://169.254.169.254/sub', 'http://[::ffff:169.254.169.254]/sub',
  'http://localhost./sub', 'http://LOCALHOST/sub', 'http://sub.localhost./sub', 'http://host.local./sub',
  'file:///etc/hosts', 'ftp://example.com/sub', 'not-a-url'
]) assert.equal(valid(url), false, url)

for (const url of ['https://provider.example/sub?Token=private', 'http://192.168.1.2/sub',
  'http://10.0.0.1/sub', 'http://172.16.0.1/sub', 'https://[2001:db8::1]/sub',
  'https://[::ffff:192.168.1.2]/sub', 'https://user:password@provider.example/sub']) {
  assert.equal(valid(url), true, url)
}
for (const address of ['127.0.0.2', '::ffff:127.0.0.1', '0:0:0:0:0:ffff:7f00:2', '::', '::1', 'not-an-ip']) {
  assert.equal(allowed(address), false, address)
}
assert.equal(allowed('192.168.1.2'), true)
assert.equal(allowed('2001:db8::1'), true)
assert.equal(sanitizeUrl('https://user:password@provider.example/private-path?Token=private-token'),
  'https://provider.example/[REDACTED]')
const defaults = load('src/shared/app-config.ts').DEFAULT_APP_CONFIG
const good = [{ address: '203.0.113.12', family: 4 }]

function clientFixture(reply = () => ({ status: 200, data: 'rules: []', headers: {} }), resolve = async () => good) {
  const requests = [], resolutions = []
  const { SubscriptionClient } = load('src/main/core/SubscriptionClient.ts', {
    axios: { get: async (url, options) => { requests.push({ url, options }); return reply(url, options, requests.length) } }
  })
  const client = new SubscriptionClient(() => defaults, () => true, {
    resolve: (...args) => { resolutions.push(args); return resolve(...args) }
  })
  return { client, requests, resolutions }
}

async function verifyTransportPolicy() {
  for (const viaProxy of [false, true]) {
    for (const bad of ['127.0.0.2', '::ffff:127.0.0.1', '169.254.169.254']) {
      const fixture = clientFixture(undefined, async () => [...good, { address: bad, family: bad.includes(':') ? 6 : 4 }])
      await assert.rejects(fixture.client.download('https://provider.invalid/sub', undefined, viaProxy), /download failed/)
      assert.equal(fixture.requests.length, 0, 'reject mixed DNS answers before opening a connection')
    }
    const fixture = clientFixture()
    await fixture.client.download('https://user:password@provider.invalid/private?Token=secret', 'Custom UA', viaProxy)
    const { url, options } = fixture.requests[0]
    assert.equal(new URL(url).hostname, viaProxy ? '203.0.113.12' : 'provider.invalid')
    assert.equal(options.headers.Host, 'provider.invalid')
    assert.equal(options.headers['User-Agent'], 'Custom UA')
    assert.equal(options.httpsAgent.options.servername, 'provider.invalid', 'TLS uses the original identity')
    assert.notEqual(options.httpsAgent.options.rejectUnauthorized, false)
    assert.equal(options.maxRedirects, 0)
    assert.deepEqual(await options.lookup('provider.invalid', {}), [good], 'socket lookup uses only pinned answers')
    assert.deepEqual(options.proxy, viaProxy ? { host: '127.0.0.1', port: defaults.kernel.mixedPort, protocol: 'http' } : false)
    assert.equal(fixture.resolutions[0][2], viaProxy)
    assert.ok(!JSON.stringify(options.headers).includes(defaults.kernel.controllerSecret))
  }
  const redirect = clientFixture((_url, _options, count) => count === 1
    ? { status: 302, headers: { location: '/next?Token=secret' } }
    : count === 2 ? { status: 307, headers: { location: 'https://other.invalid/final' } }
      : { status: 200, data: 'rules: []', headers: {} })
  await redirect.client.download('https://user:password@provider.invalid/sub')
  assert.deepEqual(redirect.resolutions.map(args => args[0]), ['provider.invalid', 'provider.invalid', 'other.invalid'])
  assert.equal(new URL(redirect.requests[2].url).username, '', 'cross-origin redirects do not inherit URL credentials')
  assert.equal(redirect.requests[0].options.signal, redirect.requests[2].options.signal, 'all hops share one deadline')
  for (const location of ['http://127.0.0.2/private', 'https://[::ffff:127.0.0.1]/sub',
    'https://localhost./sub', 'file:///private', 'http://provider.invalid/downgrade']) {
    const fixture = clientFixture(() => ({ status: 302, headers: { location } }))
    await assert.rejects(fixture.client.download('https://provider.invalid/sub'), /download failed/)
    assert.equal(fixture.requests.length, 1, location)
  }
  const rebound = clientFixture(() => ({ status: 302, headers: { location: '/next' } }),
    async () => rebound.resolutions.length === 1 ? good : [{ address: '127.0.0.2', family: 4 }])
  await assert.rejects(rebound.client.download('https://provider.invalid/sub'), /download failed/)
  assert.equal(rebound.requests.length, 1, 'DNS rebinding at a later hop never opens the second connection')
  const loop = clientFixture(() => ({ status: 301, headers: { location: '/loop' } }))
  await assert.rejects(loop.client.download('https://provider.invalid/sub'), /download failed/)
  assert.equal(loop.requests.length, 6, 'at most five redirects')
  const { SubscriptionClient } = load('src/main/core/SubscriptionClient.ts')
  const stopped = new SubscriptionClient(() => defaults, () => false)
  await assert.rejects(stopped.download('https://provider.invalid/sub', undefined, true), /Start the VPN core/)
  const timeout = new SubscriptionClient(() => defaults, () => true, { resolve: () => new Promise(() => {}), timeoutMs: 20 })
  await Promise.all([assert.rejects(timeout.download('https://provider.invalid/sub'), /download failed/),
    new Promise(resolve => setTimeout(resolve, 40))])
}

async function verifyResolver() {
  let systemLookups = 0
  let controllerError
  const queries = []
  const { resolveSubscription } = load('src/main/core/SubscriptionResolver.ts', {
    'node:dns/promises': { lookup: async () => { systemLookups++; return good } },
    axios: { get: async (url, options) => {
      queries.push({ url, options })
      if (controllerError) throw controllerError
      return { data: { Status: 0, Answer: options.params.type === 'A'
        ? [{ type: 5, data: 'alias.invalid' }, { type: 1, data: '203.0.113.12' }]
        : [{ type: 28, data: '2001:db8::1' }] } }
    } }
  })
  const signal = new AbortController().signal
  assert.deepEqual(await resolveSubscription('provider.invalid', defaults, false, signal), good)
  assert.equal(systemLookups, 1)
  const addresses = await resolveSubscription('provider.invalid', defaults, true, signal)
  assert.deepEqual(addresses, [...good, { address: '2001:db8::1', family: 6 }])
  assert.equal(systemLookups, 1, 'enabled core DNS avoids a system lookup')
  assert.deepEqual(queries.map(query => query.options.params.type), ['A', 'AAAA'])
  for (const { url, options } of queries) {
    assert.equal(url, `http://127.0.0.1:${defaults.kernel.controllerPort}/dns/query`)
    assert.equal(options.headers.Authorization, `Bearer ${defaults.kernel.controllerSecret}`)
    assert.equal(options.proxy, false)
    assert.equal(options.maxRedirects, 0, 'controller credentials cannot follow redirects')
  }
  controllerError = { response: { status: 500, data: { message: 'DNS section is disabled' } } }
  assert.deepEqual(await resolveSubscription('provider.invalid', defaults, true, signal), good)
  assert.equal(systemLookups, 2, 'disabled core DNS uses the system resolver for validation')
  for (const error of [{ response: { status: 401 } }, new Error('controller unavailable')]) {
    controllerError = error
    await assert.rejects(resolveSubscription('provider.invalid', defaults, true, signal))
    assert.equal(systemLookups, 2, 'other controller errors cannot silently change the resolver')
  }
}

async function verifyRealProxyTransport() {
  const http = require('node:http'), tls = require('node:tls'), net = require('node:net')
  const servers = [], sockets = new Set(), requests = [], connects = []
  let sni
  const listen = async server => {
    servers.push(server)
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return server.address().port
  }
  const controllerPort = await listen(http.createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${defaults.kernel.controllerSecret}`)
    const query = new URL(req.url, 'http://controller')
    assert.equal(query.pathname, '/dns/query')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ Status: 0, Answer: query.searchParams.get('type') === 'A' ? [{ type: 1, data: '203.0.113.12' }] : [] }))
  }))
  const tlsPort = await listen(tls.createServer({ SNICallback: (name, callback) => {
    sni = name; callback(new Error('Fixture intentionally has no certificate'))
  } }))
  servers.at(-1).on('tlsClientError', () => {})
  const proxy = http.createServer((req, res) => {
    requests.push({ url: req.url, host: req.headers.host, authorization: req.headers.authorization })
    if (new URL(req.url).pathname === '/redirect') {
      res.writeHead(302, { Location: 'http://127.0.0.2/forbidden' }); res.end(); return
    }
    res.end('rules: []')
  })
  proxy.on('connect', (req, socket, head) => {
    connects.push(req.url)
    const upstream = net.connect(tlsPort, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    sockets.add(upstream)
    upstream.on('close', () => sockets.delete(upstream))
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
  })
  const mixedPort = await listen(proxy)
  const { SubscriptionClient } = load('src/main/core/SubscriptionClient.ts', {
    'node:dns/promises': { lookup: () => { throw new Error('Unexpected system DNS lookup') } }
  })
  const settings = { ...defaults, kernel: { ...defaults.kernel, controllerPort, mixedPort } }
  const client = new SubscriptionClient(() => settings, () => true)
  try {
    assert.equal((await client.download('http://provider.invalid/sub', undefined, true)).content, 'rules: []')
    assert.equal(requests[0].url, 'http://203.0.113.12/sub', 'HTTP proxy receives a pinned destination')
    assert.equal(requests[0].host, 'provider.invalid', 'virtual host remains the provider')
    assert.equal(requests[0].authorization, undefined, 'controller credential never reaches the provider')
    await assert.rejects(client.download('http://provider.invalid/redirect', undefined, true), /download failed/)
    assert.equal(requests.length, 2, 'unsafe redirect never reaches proxy')
    await assert.rejects(client.download('https://provider.invalid/sub', undefined, true), /download failed/)
    assert.equal(connects[0], '203.0.113.12:443', 'HTTPS CONNECT uses the pinned destination')
    assert.equal(sni, 'provider.invalid', 'real TLS ClientHello carries the original server name')
  } finally {
    for (const socket of sockets) socket.destroy()
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  }
}

Promise.resolve().then(verifyTransportPolicy).then(verifyResolver).then(verifyRealProxyTransport)
  .then(() => console.log('PASS: subscription URL/DNS/redirect policy, pinned proxy destinations, original Host/TLS SNI, bounded deadline and safe errors'))
  .catch(error => { console.error(error); process.exitCode = 1 })
