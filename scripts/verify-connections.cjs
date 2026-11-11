const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')
const { filterConnections, groupConnections, sortConnections } =
  loadTypeScript('src/renderer/src/lib/connection-selectors.ts')

const connection = (id, path, upload, download, second, metadata = {}) => Object.freeze({
  id, metadata: Object.freeze({ network: 'tcp', processPath: path, process: '', host: 'service.example',
    sourceIP: '192.168.1.2', destinationIP: '203.0.113.1', ...metadata }),
  upload, download, start: `2026-11-12T00:00:0${second}Z`, chains: Object.freeze(['Node', 'PROXY']), rule: 'DomainSuffix'
})
const a = connection('a', 'C:\\Apps\\browser.exe', 10, 20, 1)
const b = connection('b', 'C:\\Apps\\browser.exe', 30, 40, 3, { network: 'UDP' })
const c = connection('c', '/usr/bin/agent', 100, 200, 2)
const d = connection('d', '', 0, 0, 0, { process: 'worker' })
const e = connection('e', '', 0, 0, 4, { sourceIP: '192.168.1.3' })
const f = connection('f', '', 0, 0, 5, { sourceIP: '' })
const items = Object.freeze([a, b, c, d, e, f])
const before = JSON.stringify(items)
assert.deepEqual(filterConnections(items, '  BROWSER.EXE  ', 'all'), [a, b])
assert.deepEqual(filterConnections(items, 'browser', 'tcp'), [a])
assert.deepEqual(filterConnections(items, '', 'udp'), [b])
for (const query of ['service.example', '203.0.113.1', 'domainsuffix', 'proxy', 'NODE']) {
  assert.deepEqual(filterConnections(items, query, 'all'), [...items], `searches ${query}`)
}
assert.deepEqual(filterConnections(items, 'missing', 'all'), [])
const groups = groupConnections(items, 'traffic', 'System')
assert.deepEqual(groups.map(group => group.name), ['agent', 'browser.exe', 'worker', 'IP: 192.168.1.3', 'System'])
const browser = groups[1]
assert.deepEqual(browser.connections, [a, b], 'group members retain stream order')
assert.equal(browser.activeCount, 2)
assert.equal(browser.totalUpload, 40)
assert.equal(browser.totalDownload, 60)
assert.equal(browser.latestStart, Date.parse(b.start))
assert.equal(groupConnections(filterConnections(items, '', 'tcp'), 'traffic', 'System')
  .find(group => group.name === 'browser.exe').totalDownload, 20, 'filters apply before totals')
assert.deepEqual(sortConnections(items, 'traffic', 'System').map(item => item.id), ['c', 'b', 'a', 'd', 'e', 'f'])
assert.deepEqual(sortConnections(items, 'time', 'System').map(item => item.id), ['f', 'e', 'b', 'c', 'a', 'd'])
assert.deepEqual(groupConnections(items, 'time', 'System').map(group => group.connections[0].id), ['f', 'e', 'a', 'c', 'd'])
assert.equal(sortConnections([a, b], 'process', 'System')[0], a, 'equal names keep input order')
const override = connection('override', '/usr/bin/filename', 1, 1, 0, { process: 'reported-process' })
assert.equal(groupConnections([override], 'process', 'System')[0].name, 'reported-process')
assert.deepEqual(filterConnections([override], 'filename', 'all'), [override], 'search keeps path-derived process identity')
assert.equal(groupConnections([f], 'process', 'Localized system')[0].name, 'Localized system')
assert.deepEqual(groupConnections([], 'traffic', 'System'), [])
assert.equal(JSON.stringify(items), before, 'selectors never mutate input arrays, metadata or connections')
console.log('PASS: connection search/protocol, process identity/group totals/order, stable sorting and immutable stream snapshots')
