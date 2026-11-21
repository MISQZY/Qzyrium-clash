const assert = require('node:assert/strict')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

const {
  convertSubscriptionToClashYaml,
  parseProxyUri,
  parseProxyList,
  parseShadowsocksUri,
  parseVmessUri,
  parseVlessUri,
  parseTrojanUri,
  parseHysteriaUri,
  parseHysteria2Uri,
  parseWireGuardUri,
  parseTuicUri,
  deduplicateProxyNames
} = load('src/shared/subscription-converter.ts')

const { parseProfileConfig } = load('src/shared/profile-config.ts')

// SSR uses unpadded URL-safe Base64, including very short credentials.
for (const password of ['a', 'ab', 'abc', 'пароль']) {
  const encoded = Buffer.from(password).toString('base64url')
  const uri = 'ssr://' + Buffer.from(`example.com:8388:origin:aes-256-cfb:plain:${encoded}/?remarks=${Buffer.from('ab').toString('base64url')}`).toString('base64url')
  const node = parseProxyUri(uri)
  assert.equal(node.password, password, 'SSR credentials must be decoded even when shorter than four Base64 characters')
  assert.equal(node.name, 'ab')
  assert.equal(parseProfileConfig(convertSubscriptionToClashYaml(uri)).proxies[0].password, password)
}

// 1. Shadowsocks
const ssBase64UserInfo = 'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:8388#%D0%A1%D0%B5%D1%80%D0%B2%D0%B5%D1%80%201'
assert.ok(parseProxyUri(ssBase64UserInfo))
const parsedSs1 = parseShadowsocksUri(ssBase64UserInfo)
assert.ok(parsedSs1)
assert.equal(parsedSs1.name, 'Сервер 1')
assert.equal(parsedSs1.type, 'ss')
assert.equal(parsedSs1.server, '1.2.3.4')
assert.equal(parsedSs1.port, 8388)
assert.equal(parsedSs1.cipher, 'aes-256-gcm')
assert.equal(parsedSs1.password, 'password')

// SIP002 permits a slash after the port, including before plugin parameters.
for (const endpoint of ['example.com:8388', '[::1]:8388']) {
  for (const tail of ['/#test', '/?plugin=v2ray-plugin%3Btls#test']) {
    const node = parseShadowsocksUri(`ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@${endpoint}${tail}`)
    assert.ok(node, `valid SIP002 endpoint: ${endpoint}${tail}`)
    assert.equal(node.port, 8388)
    assert.equal(node.server, endpoint.startsWith('[') ? '::1' : 'example.com')
    if (tail.includes('plugin=')) assert.equal(node.plugin, 'v2ray-plugin')
  }
}

const ssAllBase64 = 'ss://' + Buffer.from('chacha20-ietf-poly1305:secret@5.6.7.8:9000').toString('base64') + '#SS-All'
const parsedSs2 = parseShadowsocksUri(ssAllBase64)
assert.ok(parsedSs2)
assert.equal(parsedSs2.name, 'SS-All')
assert.equal(parsedSs2.server, '5.6.7.8')
assert.equal(parsedSs2.port, 9000)
assert.equal(parsedSs2.cipher, 'chacha20-ietf-poly1305')
assert.equal(parsedSs2.password, 'secret')

const ssPluginUri = plugin => `ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@127.0.0.1:8388/?plugin=${encodeURIComponent(plugin)}#plugin-test`
for (const plugin of ['obfs-local', 'simple-obfs', 'obfs']) {
  const node = parseShadowsocksUri(ssPluginUri(`${plugin};obfs=http;obfs-host=example.com`))
  assert.equal(node.plugin, 'obfs')
  assert.deepEqual(node['plugin-opts'], { mode: 'http', host: 'example.com' })
}
assert.deepEqual(parseShadowsocksUri(ssPluginUri('obfs;mode=tls;host=example.com'))['plugin-opts'],
  { mode: 'tls', host: 'example.com' })
for (const [options, expected] of [
  ['v2ray-plugin', { mode: 'websocket' }],
  ['v2ray-plugin;tls;host=example.com', { mode: 'websocket', tls: true, host: 'example.com' }],
  ['v2ray-plugin;mode=websocket;path=/ws?key=value==&encoded=%2F',
    { mode: 'websocket', path: '/ws?key=value==&encoded=%2F' }],
  ['v2ray-plugin;mode=quic', { mode: 'quic' }]
]) {
  const input = ssPluginUri(options)
  const node = parseShadowsocksUri(input)
  assert.equal(node.plugin, 'v2ray-plugin')
  assert.deepEqual(node['plugin-opts'], expected)
  assert.deepEqual(parseProfileConfig(convertSubscriptionToClashYaml(input)).proxies[0]['plugin-opts'], expected)
}

// 2. VMess
const vmessJson = {
  v: '2',
  ps: 'VMess-Node',
  add: 'vmess.example.com',
  port: '443',
  id: 'a3a29614-2327-4420-b96e-d9a136133ec6',
  aid: '0',
  scy: 'auto',
  net: 'ws',
  type: 'none',
  host: 'vmess.example.com',
  path: '/v2ray',
  tls: 'tls',
  sni: 'vmess.example.com'
}
const vmessUri = 'vmess://' + Buffer.from(JSON.stringify(vmessJson)).toString('base64')
const parsedVmess = parseVmessUri(vmessUri)
assert.ok(parsedVmess)
assert.equal(parsedVmess.name, 'VMess-Node')
assert.equal(parsedVmess.type, 'vmess')
assert.equal(parsedVmess.server, 'vmess.example.com')
assert.equal(parsedVmess.port, 443)
assert.equal(parsedVmess.uuid, 'a3a29614-2327-4420-b96e-d9a136133ec6')
assert.equal(parsedVmess.tls, true)
assert.equal(parsedVmess.network, 'ws')
assert.deepEqual(parsedVmess['ws-opts'], { path: '/v2ray', headers: { Host: 'vmess.example.com' } })

// 3. VLESS
const vlessUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@vless.example.com:443?type=tcp&security=reality&pbk=112233445566778899aabbccddeeff&sid=123456&flow=xtls-rprx-vision&sni=yahoo.com&fp=chrome#VLESS-Reality'
const parsedVless = parseVlessUri(vlessUri)
assert.ok(parsedVless)
assert.equal(parsedVless.name, 'VLESS-Reality')
assert.equal(parsedVless.type, 'vless')
assert.equal(parsedVless.server, 'vless.example.com')
assert.equal(parsedVless.port, 443)
assert.equal(parsedVless.uuid, 'b831381d-6324-4d53-ad4f-8cda48b30811')
assert.equal(parsedVless.flow, 'xtls-rprx-vision')
assert.equal(parsedVless.tls, true)
assert.equal(parsedVless.servername, 'yahoo.com')
assert.equal(parsedVless['client-fingerprint'], 'chrome')
assert.deepEqual(parsedVless['reality-opts'], {
  'public-key': '112233445566778899aabbccddeeff',
  'short-id': '123456'
})

// 4. Trojan
const trojanUri = 'trojan://trojanpassword@trojan.example.com:443?sni=trojan.example.com&alpn=h2,http/1.1&type=ws&path=/tr#Trojan-Node'
const parsedTrojan = parseTrojanUri(trojanUri)
assert.ok(parsedTrojan)
assert.equal(parsedTrojan.name, 'Trojan-Node')
assert.equal(parsedTrojan.type, 'trojan')
assert.equal(parsedTrojan.server, 'trojan.example.com')
assert.equal(parsedTrojan.port, 443)
assert.equal(parsedTrojan.password, 'trojanpassword')
assert.equal(parsedTrojan.sni, 'trojan.example.com')
assert.deepEqual(parsedTrojan.alpn, ['h2', 'http/1.1'])
assert.deepEqual(parsedTrojan['ws-opts'], { path: '/tr' })

// gRPC must retain the core default, independently of WebSocket's default path.
for (const prefix of [
  'vless://550e8400-e29b-41d4-a716-446655440000@127.0.0.1:443',
  'trojan://secret@127.0.0.1:443'
]) {
  for (const [params, expected] of [
    ['', ''],
    ['&serviceName=', ''],
    ['&serviceName=custom', 'custom'],
    ['&path=legacy', 'legacy'],
    ['&serviceName=custom&path=ignored', 'custom'],
    ['&serviceName=&path=ignored', ''],
    ['&serviceName=%2Fcustom%2FTun', '/custom/Tun']
  ]) {
    const input = `${prefix}?type=grpc${params}`
    assert.equal(parseProxyUri(input)['grpc-opts']['grpc-service-name'], expected)
    assert.equal(parseProfileConfig(convertSubscriptionToClashYaml(input)).proxies[0]['grpc-opts']['grpc-service-name'], expected)
  }
  assert.equal(parseProxyUri(`${prefix}?type=ws`)['ws-opts'].path, '/')
}

// 5. Hysteria 2
const hy2Uri = 'hy2://hy2pass@hy2.example.com:8443?sni=hy2.example.com&obfs=salamander&obfs-password=obfspass#Hysteria2-Node'
const parsedHy2 = parseHysteria2Uri(hy2Uri)
assert.ok(parsedHy2)
assert.equal(parsedHy2.name, 'Hysteria2-Node')
assert.equal(parsedHy2.type, 'hysteria2')
assert.equal(parsedHy2.server, 'hy2.example.com')
assert.equal(parsedHy2.port, 8443)
assert.equal(parsedHy2.password, 'hy2pass')
assert.equal(parsedHy2.sni, 'hy2.example.com')
assert.equal(parsedHy2.obfs, 'salamander')
assert.equal(parsedHy2['obfs-password'], 'obfspass')

for (const scheme of ['hy2', 'hysteria2']) {
  for (const [auth, expected] of [
    ['user:pass', 'user:pass'],
    ['user%40domain:p%3Ass%25word', 'user@domain:p:ss%word'],
    ['user%3Apass', 'user:pass'],
    ['token%25value', 'token%value']
  ]) {
    const input = `${scheme}://${auth}@127.0.0.1:443#auth-test`
    assert.equal(parseHysteria2Uri(input).password, expected)
    assert.equal(parseProfileConfig(convertSubscriptionToClashYaml(input)).proxies[0].password, expected)
  }
}

// 6. TUIC
const tuicUri = 'tuic://c8d20391-768a-4cbb-a400-f6551bca463e:tuicpass@tuic.example.com:8443?congestion_control=bbr&sni=tuic.example.com#TUIC-Node'
const parsedTuic = parseTuicUri(tuicUri)
assert.ok(parsedTuic)
assert.equal(parsedTuic.name, 'TUIC-Node')
assert.equal(parsedTuic.type, 'tuic')
assert.equal(parsedTuic.server, 'tuic.example.com')
assert.equal(parsedTuic.port, 8443)
assert.equal(parsedTuic.uuid, 'c8d20391-768a-4cbb-a400-f6551bca463e')
assert.equal(parsedTuic.password, 'tuicpass')
assert.equal(parsedTuic['congestion-controller'], 'bbr')

const tuicInsecure = parseTuicUri('tuic://id:pass@127.0.0.1:443?insecure=1&disable_sni=1')
assert.equal(tuicInsecure['skip-cert-verify'], true)
assert.equal(tuicInsecure['disable-sni'], true)
assert.equal(parseVlessUri('vless://id@127.0.0.1:443?security=tls&insecure=1')['skip-cert-verify'], true)
assert.equal(parseVlessUri('vless://id@127.0.0.1:443?tls=1').tls, true)
assert.equal(parseTrojanUri('trojan://pass@127.0.0.1:443?allowInsecure=1')['skip-cert-verify'], true)
assert.equal(parseVmessUri('vmess://' + Buffer.from(JSON.stringify({ ...vmessJson, allowInsecure: '1' })).toString('base64'))['skip-cert-verify'], true)

// WHATWG URL removes an explicitly specified default HTTP port.
for (const [authority, expectedServer, expectedPort] of [
  ['example.com', 'example.com', 80],
  ['example.com:80', 'example.com', 80],
  ['example.com:8080', 'example.com', 8080],
  ['[::1]:80', '::1', 80]
]) {
  const input = `http://user:p%40ss@${authority}#http-test`
  const node = parseProxyUri(input)
  assert.ok(node)
  assert.equal(node.type, 'http')
  assert.equal(node.server, expectedServer)
  assert.equal(node.port, expectedPort)
  assert.equal(node.username, 'user')
  assert.equal(node.password, 'p@ss')
  assert.equal(parseProfileConfig(convertSubscriptionToClashYaml(input)).proxies.length, 1)
}
assert.equal(parseProxyUri('http://example.com:0'), null)
assert.equal(parseProxyUri('socks5://example.com'), null)
assert.equal(parseProxyUri('socks5://example.com:1080').port, 1080)

// 7. Multi-line list and name deduplication
const rawList = `
# Comment line
${ssBase64UserInfo}
${vlessUri}
${vlessUri}
`
const parsedList = parseProxyList(rawList)
assert.equal(parsedList.length, 3)
deduplicateProxyNames(parsedList)
assert.equal(parsedList[0].name, 'Сервер 1')
assert.equal(parsedList[1].name, 'VLESS-Reality')
assert.equal(parsedList[2].name, 'VLESS-Reality (1)')

const collidingNames = ['Node', 'Node', 'Node (1)', 'Node (2)', 'Node']
const collidingNodes = collidingNames.map(name => ({ name, type: 'trojan', server: '127.0.0.1', port: 443 }))
deduplicateProxyNames(collidingNodes)
assert.deepEqual(collidingNodes.map(node => node.name), ['Node', 'Node (3)', 'Node (1)', 'Node (2)', 'Node (4)'])
deduplicateProxyNames(collidingNodes)
assert.equal(new Set(collidingNodes.map(node => node.name)).size, collidingNodes.length)

// Group names share Mihomo's namespace with nodes; references must follow any rename.
const builtinNames = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL']
const reservedNames = [...builtinNames, ...builtinNames, ...builtinNames.map(name => `${name} (1)`)]
for (const names of [['AUTO'], ['PROXY'], ['AUTO', 'AUTO (1)', 'PROXY', 'PROXY (1)'], collidingNames,
  ...builtinNames.map(name => [name]), reservedNames]) {
  const input = names.map(name => `trojan://secret@127.0.0.1:443#${encodeURIComponent(name)}`).join('\n')
  for (const payload of [input, Buffer.from(input).toString('base64')]) {
    const config = parseProfileConfig(convertSubscriptionToClashYaml(payload))
    const nodeNames = config.proxies.map(node => node.name)
    assert.ok(nodeNames.every(name => !builtinNames.includes(name)), 'nodes must not shadow built-in policies')
    const [select, auto] = config['proxy-groups']
    const allNames = [...nodeNames, select.name, auto.name]
    assert.equal(new Set(allNames).size, allNames.length)
    assert.deepEqual(select.proxies, [auto.name, ...nodeNames])
    assert.deepEqual(auto.proxies, nodeNames)
    assert.deepEqual(config.rules, [`MATCH,${select.name}`])
    assert.equal(config.proxies.length, names.length)
  }
}

// 8. Conversion to Clash YAML from raw list
const generatedYaml = convertSubscriptionToClashYaml(rawList)
assert.ok(generatedYaml.includes('proxies:'))
assert.ok(generatedYaml.includes('proxy-groups:'))
assert.ok(generatedYaml.includes('name: PROXY'))
assert.ok(generatedYaml.includes('name: AUTO'))
assert.ok(generatedYaml.includes('MATCH,PROXY'))

// 9. Base64-encoded subscription list
const base64Sub = Buffer.from(rawList).toString('base64')
const fromBase64Yaml = convertSubscriptionToClashYaml(base64Sub)
assert.ok(fromBase64Yaml.includes('proxies:'))
assert.ok(fromBase64Yaml.includes('name: PROXY'))

// 10. Base64-encoded Clash YAML
const rawClashYaml = `
proxies:
  - name: "Existing"
    type: ss
    server: 1.1.1.1
    port: 8080
    cipher: aes-128-gcm
    password: test
rules:
  - MATCH,DIRECT
`
const base64ClashYaml = Buffer.from(rawClashYaml).toString('base64')
const decodedClashYaml = convertSubscriptionToClashYaml(base64ClashYaml)
assert.ok(decodedClashYaml.includes('Existing'))
assert.ok(decodedClashYaml.includes('rules:'))

// 11. Existing Clash YAML should remain intact
const preservedYaml = convertSubscriptionToClashYaml(rawClashYaml)
assert.equal(preservedYaml, rawClashYaml)

// 12. parseProfileConfig handles both YAML and Base64/URI subscriptions
const configFromUri = parseProfileConfig(rawList)
assert.ok(Array.isArray(configFromUri.proxies))
assert.equal(configFromUri.proxies.length, 3)
assert.ok(Array.isArray(configFromUri['proxy-groups']))

const configFromBase64 = parseProfileConfig(base64Sub)
assert.ok(Array.isArray(configFromBase64.proxies))
assert.equal(configFromBase64.proxies.length, 3)

// 13. VLESS XHTTP & HTTPUpgrade transports
const vlessXhttp = parseVlessUri('vless://uuid@vless.example.com:443?type=xhttp&path=/xhttp-path&host=custom.host&mode=packet-up#VLESS-XHTTP')
assert.ok(vlessXhttp)
assert.equal(vlessXhttp.network, 'xhttp')
assert.deepEqual(vlessXhttp['xhttp-opts'], { path: '/xhttp-path', headers: { Host: 'custom.host' }, mode: 'packet-up' })

const vlessHttpUpgrade = parseVlessUri('vless://uuid@vless.example.com:443?type=httpupgrade&path=/up-path&host=up.host#VLESS-Upgrade')
assert.ok(vlessHttpUpgrade)
assert.equal(vlessHttpUpgrade.network, 'httpupgrade')
assert.deepEqual(vlessHttpUpgrade['httpupgrade-opts'], { path: '/up-path', headers: { Host: 'up.host' } })

// 14. Hysteria 2 port ranges & hopping
const hy2PortRange = parseHysteria2Uri('hy2://pass@hy2.example.com:20000-30000#Hy2-Range')
assert.ok(hy2PortRange)
assert.equal(hy2PortRange.server, 'hy2.example.com')
assert.equal(hy2PortRange.ports, '20000-30000')

const hy2Mport = parseHysteria2Uri('hy2://pass@hy2.example.com:443?mport=10000,10001,20000-25000#Hy2-Mport')
assert.ok(hy2Mport)
assert.equal(hy2Mport.ports, '10000,10001,20000-25000')

const hy2AlpnInsecure = parseHysteria2Uri('hy2://pass@hy2.example.com:443?alpn=h3,custom&allowInsecure=1#Hy2-Alpn')
assert.ok(hy2AlpnInsecure)
assert.deepEqual(hy2AlpnInsecure.alpn, ['h3', 'custom'])
assert.equal(hy2AlpnInsecure['skip-cert-verify'], true)

const hy1Insecure = parseHysteriaUri('hysteria://auth@hy.example.com:443?allow_insecure=true#Hy1-Insecure')
assert.ok(hy1Insecure)
assert.equal(hy1Insecure['skip-cert-verify'], true)

// 15. WireGuard dual-stack IP and bracketed reserved
const wgDual = parseWireGuardUri('wireguard://cHJpdmF0ZWtleQ==@wg.example.com:51820?publickey=cHVibGlja2V5&ip=10.0.0.2%2Cfd00%3A%3A2&reserved=%5B0%2C1%2C2%5D#WG-Dual')
assert.ok(wgDual)
assert.equal(wgDual.ip, '10.0.0.2')
assert.equal(wgDual.ipv6, 'fd00::2')
assert.deepEqual(wgDual.reserved, [0, 1, 2])

// 16. HTTPS and SOCKS proxies
const httpsProxy = parseProxyUri('https://usr:pwd@https.example.com:8443?sni=custom.sni&allow_insecure=1#HTTPS-Node')
assert.ok(httpsProxy)
assert.equal(httpsProxy.type, 'http')
assert.equal(httpsProxy.server, 'https.example.com')
assert.equal(httpsProxy.port, 8443)
assert.equal(httpsProxy.username, 'usr')
assert.equal(httpsProxy.password, 'pwd')
assert.equal(httpsProxy.tls, true)
assert.equal(httpsProxy.sni, 'custom.sni')
assert.equal(httpsProxy['skip-cert-verify'], true)

const socks5hProxy = parseProxyUri('socks5h://socks.example.com:1080#Socks-Default')
assert.ok(socks5hProxy)
assert.equal(socks5hProxy.type, 'socks5')
assert.equal(socks5hProxy.port, 1080)

const ssWithEmbeddedQuery = parseProxyUri('ss://' + Buffer.from('aes-128-gcm:pass@1.1.1.1:8388?plugin=obfs-local;obfs=http#test').toString('base64'))
assert.ok(ssWithEmbeddedQuery)
assert.equal(ssWithEmbeddedQuery.server, '1.1.1.1')
assert.equal(ssWithEmbeddedQuery.port, 8388)
assert.equal(ssWithEmbeddedQuery.plugin, 'obfs')

// 17. Invalid content still throws expected error
assert.throws(() => parseProfileConfig('this is not a valid proxy config or base64'), /Profile must contain a non-empty Clash\/Mihomo YAML object/)

console.log('PASS: subscription converter correctly parses SS, VMess, VLESS, Trojan, Hysteria2, TUIC, Base64 subscriptions and converts to Clash YAML')
