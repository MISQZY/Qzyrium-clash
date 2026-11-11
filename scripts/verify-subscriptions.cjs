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
console.log('PASS: subscription URL policy blocks canonical and alternate loopback/metadata addresses while retaining HTTP and LAN subscriptions')
