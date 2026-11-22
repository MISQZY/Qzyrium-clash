const assert = require('node:assert/strict')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const tls = require('node:tls')
const { EventEmitter } = require('node:events')
const { PassThrough, Readable } = require('node:stream')
const { loadTypeScript } = require('./fixtures/typescript.cjs')

const latest = 'https://api.github.com/repos/MetaCubeX/mihomo/releases/latest'
const checksum = 'https://github.com/MetaCubeX/mihomo/releases/download/v1/checksums.txt'
const roots = Object.freeze(['fixture bundled root'])

// Real HTTP CONNECT framing/socket handoff; mocked TLS/HTTPS assert the trust boundary
// without injecting a test CA or a transport hook into the production API.
function fixture(outcomes, { tlsError, stallTls = false, lateTlsSuccess = false, httpModule = http } = {}) {
  const requests = [], tlsConnections = [], agents = [], connectionCallbacks = [], secureSockets = []
  class Agent {
    constructor(options) { this.options = options; agents.push(this) }
    destroy() { this.socket?.destroy() }
  }
  const secure = {
    rootCertificates: roots,
    checkServerIdentity: tls.checkServerIdentity,
    connect(options) {
      tlsConnections.push(options)
      assert.equal(options.rejectUnauthorized, true)
      assert.deepEqual(options.ca, roots)
      assert.equal(options.checkServerIdentity, tls.checkServerIdentity)
      assert.equal(options.servername, 'api.github.com')
      assert.equal(options.socket.remoteAddress, '127.0.0.1')
      const socket = new PassThrough()
      secureSockets.push(socket)
      socket.once('close', () => options.socket.destroy())
      queueMicrotask(() => {
        if (tlsError) {
          socket.destroy(tlsError)
          if (lateTlsSuccess) setImmediate(() => socket.emit('secureConnect'))
        }
        else if (!stallTls) socket.emit('secureConnect')
      })
      return socket
    }
  }
  const https = {
    Agent,
    request(url, options, callback) {
      requests.push({ url: url.href, options })
      assert.equal(options.rejectUnauthorized, true)
      assert.deepEqual(options.ca, roots)
      assert.equal(options.checkServerIdentity, tls.checkServerIdentity)
      assert.equal(options.servername, url.hostname)
      assert.deepEqual(options.agent.options.ca, roots)
      assert.equal(options.agent.options.rejectUnauthorized, true)
      assert.ok(options.agent instanceof Agent, 'requests never use an environment-configured global agent')
      const request = new EventEmitter()
      let failed = false
      const fail = error => {
        if (failed) return
        failed = true
        options.signal.removeEventListener('abort', abort)
        request.emit('error', error)
      }
      const abort = () => fail(options.signal.reason)
      options.signal.addEventListener('abort', abort, { once: true })
      const respond = () => {
        const outcome = outcomes.shift()
        assert.ok(outcome, 'every request has a fixture outcome')
        if (outcome.stall) return
        if (outcome.error) { fail(outcome.error); return }
        options.signal.removeEventListener('abort', abort)
        const response = Readable.from(outcome.chunks ?? [outcome.body ?? '{}'])
        response.statusCode = outcome.status ?? 200
        response.headers = outcome.headers ?? {}
        callback(response)
      }
      request.end = () => queueMicrotask(() => {
        if (options.agent.createConnection) {
          options.agent.createConnection({ servername: url.hostname }, (error, socket) => {
            connectionCallbacks.push({ error, socket })
            if (error) { fail(error); return }
            options.agent.socket = socket
            socket.on('error', () => {})
            respond()
          })
        } else respond()
      })
      return request
    }
  }
  const { fetchCoreReleaseResource: fetch } = loadTypeScript('src/main/core/core-release-fetch.ts', {
    'node:http': httpModule, 'node:https': https, 'node:tls': secure
  })
  return { fetch, requests, tlsConnections, agents, connectionCallbacks, secureSockets }
}

async function verifyNativeTlsRejection() {
  const sockets = new Set()
  const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); return socket }
  const upstream = https.createServer({
    key: fs.readFileSync(path.join(__dirname, 'fixtures/core-release-untrusted.key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/core-release-untrusted.cert.pem'))
  }, (_request, response) => response.end('{"forged":true}'))
  upstream.on('connection', track)
  upstream.on('tlsClientError', () => {})
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const proxy = http.createServer()
  proxy.on('connect', (request, socket) => {
    track(socket)
    assert.equal(request.url, 'api.github.com:443')
    const target = track(net.connect(upstream.address().port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      socket.pipe(target).pipe(socket)
    }))
    target.on('error', () => socket.destroy())
    socket.on('error', () => target.destroy())
    socket.once('close', () => target.destroy())
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  let directCalls = 0
  const transport = { ...https, request(url, options, callback) {
    if (!Object.hasOwn(options.agent, 'createConnection')) {
      directCalls++
      const request = new EventEmitter()
      request.end = () => queueMicrotask(() => request.emit('error', new Error('fixture direct network blocked')))
      return request
    }
    return https.request(url, options, callback)
  } }
  const { fetchCoreReleaseResource: fetch } = loadTypeScript('src/main/core/core-release-fetch.ts', { 'node:https': transport })
  try {
    await assert.rejects(fetch(latest, { responseType: 'json', timeout: 2000, proxyPort: proxy.address().port }),
      error => ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code),
      'native TLS rejects a forged GitHub certificate even when NODE_TLS_REJECT_UNAUTHORIZED=0')
    assert.equal(directCalls, 1)
  } finally {
    for (const socket of sockets) socket.destroy()
    await Promise.all([new Promise(resolve => upstream.close(resolve)), new Promise(resolve => proxy.close(resolve))])
  }
}

async function run() {
  for (const url of ['http://api.github.com/repos/MetaCubeX/mihomo/releases/latest',
    'https://api.github.com.evil.test/repos/MetaCubeX/mihomo/releases/latest',
    'https://user:pass@api.github.com/repos/MetaCubeX/mihomo/releases/latest',
    'https://api.github.com:444/repos/MetaCubeX/mihomo/releases/latest',
    'https://api.github.com/repos/Other/mihomo/releases/latest',
    'https://github.com/MetaCubeX/mihomo/releases/download/v1/mihomo.exe',
    'https://release-assets.githubusercontent.com/untrusted-initial-url']) {
    const test = fixture([])
    await assert.rejects(test.fetch(url, { responseType: 'text', timeout: 1000 }), /Untrusted/)
    assert.equal(test.requests.length, 0)
  }
  const direct = fixture([{ body: '{"tag_name":"v1"}' }])
  assert.deepEqual(await direct.fetch(latest, { responseType: 'json', timeout: 1000 }), { tag_name: 'v1' })
  assert.equal(direct.tlsConnections.length, 0)
  assert.equal(direct.requests[0].options.headers['Accept-Encoding'], 'identity')
  for (const proxyPort of [0, -1, 65536, 1.5, NaN]) {
    await assert.rejects(fixture([]).fetch(latest, { responseType: 'json', timeout: 1000, proxyPort }), /proxy port/)
  }
  await assert.rejects(fixture([{ stall: true }]).fetch(latest, { responseType: 'json', timeout: 30 }), /timed out/)
  const alpha = fixture([{ body: '{}' }])
  await alpha.fetch(latest.replace('latest', 'tags/Prerelease-Alpha'), { responseType: 'json', timeout: 1000 })
  const redirected = fixture([{ status: 302, headers: { location: 'https://release-assets.githubusercontent.com/checksums?token=fixture' } }, { body: 'abc  mihomo.gz\n' }])
  assert.equal(await redirected.fetch(checksum, { responseType: 'text', timeout: 1000 }), 'abc  mihomo.gz\n')
  const version = fixture([{ body: 'v1' }])
  assert.equal(await version.fetch(checksum.replace('checksums.txt', 'version.txt'), { responseType: 'text', timeout: 1000 }), 'v1')
  for (const location of ['http://release-assets.githubusercontent.com/data', 'https://evil.test/data', 'https://github.com/attacker/mihomo/releases/download/v1/checksums.txt']) {
    const test = fixture([{ status: 302, headers: { location } }])
    await assert.rejects(test.fetch(checksum, { responseType: 'text', timeout: 1000, proxyPort: 7890 }), /Untrusted/)
    assert.equal(test.requests.length, 1, 'unsafe redirects do not fall back to a proxy')
  }
  const loop = fixture(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: checksum } })))
  await assert.rejects(loop.fetch(checksum, { responseType: 'text', timeout: 1000 }), /Too many/)
  assert.equal(loop.requests.length, 6, 'at most five redirects are followed')
  for (const outcome of [{ headers: { 'content-length': String(8 * 1024 * 1024 + 1) } },
    { chunks: [Buffer.alloc(8 * 1024 * 1024), Buffer.alloc(1)] }]) {
    await assert.rejects(fixture([outcome]).fetch(checksum, { responseType: 'text', timeout: 1000 }), /8 MiB/)
  }
  await assert.rejects(fixture([{ status: 500 }]).fetch(latest, { responseType: 'json', timeout: 1000 }), /HTTP 500/)
  await assert.rejects(fixture([{ body: '{invalid' }]).fetch(latest, { responseType: 'json', timeout: 1000 }), SyntaxError)
  const lateSocket = new PassThrough()
  const late = fixture([{ error: new Error('direct blocked') }], { httpModule: { request() {
    const request = new EventEmitter()
    request.end = () => queueMicrotask(() => {
      request.emit('error', new Error('CONNECT failed first'))
      request.emit('error', new Error('CONNECT failed again'))
      request.emit('connect', { statusCode: 200 }, lateSocket, Buffer.alloc(0))
    })
    return request
  } } })
  await assert.rejects(late.fetch(latest, { responseType: 'json', timeout: 1000, proxyPort: 7890 }), /CONNECT failed first/)
  assert.equal(late.connectionCallbacks.length, 1, 'CONNECT failure completes the agent callback once')
  assert.equal(lateSocket.destroyed, true, 'a late CONNECT socket is closed after failure')

  const sockets = new Set(), connects = []
  let connectStatus = 200
  const proxy = http.createServer()
  proxy.on('connect', (request, socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    connects.push({ method: request.method, url: request.url, host: request.headers.host })
    socket.write(`HTTP/1.1 ${connectStatus} ${connectStatus === 200 ? 'Connection Established' : 'Denied'}\r\n\r\n`)
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  const port = proxy.address().port
  try {
    const test = fixture([{ error: new Error('direct blocked') }, { body: '{"tag_name":"trusted"}' }])
    assert.deepEqual(await test.fetch(latest, { responseType: 'json', timeout: 1000, proxyPort: port }), { tag_name: 'trusted' })
    assert.deepEqual(connects[0], { method: 'CONNECT', url: 'api.github.com:443', host: 'api.github.com:443' })
    assert.equal(test.tlsConnections.length, 1)
    const badTls = fixture([{ error: new Error('direct blocked') }], { tlsError: new Error('certificate verification failed') })
    await assert.rejects(badTls.fetch(latest, { responseType: 'json', timeout: 1000, proxyPort: port }), /certificate verification failed/)
    const lateTls = fixture([{ error: new Error('direct blocked') }], { tlsError: new Error('TLS failed first'), lateTlsSuccess: true })
    await assert.rejects(lateTls.fetch(latest, { responseType: 'json', timeout: 1000, proxyPort: port }), /TLS failed first/)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(lateTls.connectionCallbacks.length, 1, 'a late secureConnect does not complete the agent callback twice')
    assert.equal(lateTls.secureSockets[0].destroyed, true)
    connectStatus = 407
    const denied = fixture([{ error: new Error('direct blocked') }])
    await assert.rejects(denied.fetch(latest, { responseType: 'json', timeout: 1000, proxyPort: port }), /CONNECT failed: 407/)
    assert.equal(denied.tlsConnections.length, 0)
    connectStatus = 200
    const stalled = fixture([{ stall: true }], { stallTls: true })
    const started = Date.now()
    await assert.rejects(stalled.fetch(latest, { responseType: 'json', timeout: 100, proxyPort: port }), /timed out|aborted/)
    assert.ok(Date.now() - started < 1000, 'one deadline bounds direct connection, CONNECT and TLS handshake')
    assert.equal(stalled.tlsConnections.length, 1, 'direct timeout reserves a proxy fallback attempt')
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => proxy.close(resolve))
  }
  await verifyNativeTlsRejection()
  console.log('PASS: official core release HTTPS origins, bundled trust roots, bounded redirects/body/deadline and real loopback CONNECT fallback')
}

const hostileEnvironment = {
  HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1',
  NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_EXTRA_CA_CERTS: 'untrusted-extra-roots.pem'
}
const previousEnvironment = Object.fromEntries(Object.keys(hostileEnvironment).map(key => [key, process.env[key]]))
Object.assign(process.env, hostileEnvironment)
run().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
