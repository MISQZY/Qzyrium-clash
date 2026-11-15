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
  parseHysteria2Uri,
  parseTuicUri,
  deduplicateProxyNames
} = load('src/shared/subscription-converter.ts')

const { parseProfileConfig } = load('src/shared/profile-config.ts')

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

const ssAllBase64 = 'ss://' + Buffer.from('chacha20-ietf-poly1305:secret@5.6.7.8:9000').toString('base64') + '#SS-All'
const parsedSs2 = parseShadowsocksUri(ssAllBase64)
assert.ok(parsedSs2)
assert.equal(parsedSs2.name, 'SS-All')
assert.equal(parsedSs2.server, '5.6.7.8')
assert.equal(parsedSs2.port, 9000)
assert.equal(parsedSs2.cipher, 'chacha20-ietf-poly1305')
assert.equal(parsedSs2.password, 'secret')

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

// 13. Invalid content still throws expected error
assert.throws(() => parseProfileConfig('this is not a valid proxy config or base64'), /Profile must contain a non-empty Clash\/Mihomo YAML object/)

console.log('PASS: subscription converter correctly parses SS, VMess, VLESS, Trojan, Hysteria2, TUIC, Base64 subscriptions and converts to Clash YAML')
