const assert = require('node:assert/strict')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

const { parseSubscriptionMetadata } = load('src/main/utils/subscription-metadata.ts')
const { visibleProxyGroups } = load('src/renderer/src/lib/proxies.ts')
const { isRealProxyNode, resolveLeafNode } = load('src/shared/mihomo.ts')
const { canToggleProfileDisplayMode } = load('src/shared/profile.ts')

// 1. Header parsing
assert.equal(parseSubscriptionMetadata({ 'display-mode': 'single' }, '').displayMode, 'single')
assert.equal(parseSubscriptionMetadata({ 'display-mode': 'simple' }, '').displayMode, 'single')
assert.equal(parseSubscriptionMetadata({ 'display-mode': 'full' }, '').displayMode, 'full')
assert.equal(parseSubscriptionMetadata({ 'Display-Mode': 'FULL' }, '').displayMode, 'full')
assert.equal(parseSubscriptionMetadata({ 'DISPLAY-MODE': '  single  ' }, '').displayMode, 'single')
assert.equal(parseSubscriptionMetadata({ 'profile-display-mode': 'full' }, '').displayMode, 'full')
assert.equal(parseSubscriptionMetadata({ 'profile-display-mode': 'single' }, '').displayMode, 'single')
assert.equal(parseSubscriptionMetadata({ 'display-mode': 'other' }, '').displayMode, undefined)
assert.equal(parseSubscriptionMetadata({}, '').displayMode, undefined)

// 2. Real proxy node detection
const sampleProxies = {
  GLOBAL: { name: 'GLOBAL', type: 'Selector', all: ['PROXY', 'Server 1', 'Server 2'], now: 'PROXY' },
  PROXY: { name: 'PROXY', type: 'Selector', all: ['Server 1', 'Server 2'], now: 'Server 1' },
  AUTO: { name: 'AUTO', type: 'URLTest', all: ['Server 1', 'Server 2'], now: 'Server 1' },
  DIRECT: { name: 'DIRECT', type: 'Direct' },
  REJECT: { name: 'REJECT', type: 'Reject' },
  'REJECT-DROP': { name: 'REJECT-DROP', type: 'RejectDrop' },
  'PASS-RULE': { name: 'PASS-RULE', type: 'PassRule' },
  'DNS-OUT': { name: 'DNS-OUT', type: 'Dns' },
  'Pathrule': { name: 'Pathrule', type: 'Pathrule' },
  'Server 1': { name: 'Server 1', type: 'vless', server: '1.1.1.1', port: 443 },
  'Server 2': { name: 'Server 2', type: 'ss', server: '2.2.2.2', port: 8388 }
}

assert.equal(isRealProxyNode('GLOBAL', sampleProxies), false)
assert.equal(isRealProxyNode('PROXY', sampleProxies), false)
assert.equal(isRealProxyNode('AUTO', sampleProxies), false)
assert.equal(isRealProxyNode('DIRECT', sampleProxies), false)
assert.equal(isRealProxyNode('REJECT', sampleProxies), false)
assert.equal(isRealProxyNode('REJECT-DROP', sampleProxies), false)
assert.equal(isRealProxyNode('PASS-RULE', sampleProxies), false)
assert.equal(isRealProxyNode('DNS-OUT', sampleProxies), false)
assert.equal(isRealProxyNode('Pathrule', sampleProxies), false)
assert.equal(isRealProxyNode('Server 1', sampleProxies), true)
assert.equal(isRealProxyNode('Server 2', sampleProxies), true)

// 3. Leaf node resolution
assert.equal(resolveLeafNode('GLOBAL', sampleProxies), 'Server 1')
assert.equal(resolveLeafNode('PROXY', sampleProxies), 'Server 1')
assert.equal(resolveLeafNode('Server 2', sampleProxies), 'Server 2')

// 4. visibleProxyGroups
// Full mode shows all configured/rule groups
assert.deepEqual(visibleProxyGroups(sampleProxies, [{ proxy: 'PROXY' }], 'rule', 'full'), ['PROXY', 'AUTO'])
// Single mode shows only the first group provided by provider
assert.deepEqual(visibleProxyGroups(sampleProxies, [{ proxy: 'PROXY' }], 'rule', 'single'), ['PROXY'])
// Legacy alias 'simple' also works as single
assert.deepEqual(visibleProxyGroups(sampleProxies, [{ proxy: 'PROXY' }], 'rule', 'simple'), ['PROXY'])
// Default when omitted is full mode
assert.deepEqual(visibleProxyGroups(sampleProxies, [{ proxy: 'PROXY' }], 'rule'), ['PROXY', 'AUTO'])

// 5. canToggleProfileDisplayMode capability (strictly when server header was passed)
assert.equal(canToggleProfileDisplayMode({ serverDisplayMode: 'full' }), true)
assert.equal(canToggleProfileDisplayMode({ serverDisplayMode: 'single' }), true)
assert.equal(canToggleProfileDisplayMode({ serverDisplayMode: 'full', displayMode: 'single' }), true)
assert.equal(canToggleProfileDisplayMode({ displayMode: 'full' }), false)
assert.equal(canToggleProfileDisplayMode({ displayMode: 'single' }), false)
assert.equal(canToggleProfileDisplayMode({}), false)
assert.equal(canToggleProfileDisplayMode(null), false)

console.log('PASS: display-mode parsing, real node filtering, leaf resolution, visible group switching, and toggle capability')
