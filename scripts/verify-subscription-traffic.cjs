const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')
const { SubscriptionTrafficAccounting } = loadTypeScript('src/main/core/SubscriptionTrafficAccounting.ts')
const profile = { id: 'one', updatedAt: 1, lastFetchedAt: 1, userInfo: { total: 1000, download: 100 } }
const accounting = new SubscriptionTrafficAccounting()
accounting.beginSession(profile)
assert.equal(accounting.sample(profile, 100).runtimeDeltaBytes, 100)
assert.equal(accounting.sample(profile, 150).runtimeDeltaBytes, 150)
// Repeated IPC reads, page remounts and metadata-only edits do not discard bytes.
assert.equal(accounting.sample({ ...profile, updatedAt: 2 }, 150).runtimeDeltaBytes, 150)
accounting.beginSession(profile)
assert.equal(accounting.sample(profile, 10).runtimeDeltaBytes, 160, 'new core bytes are counted immediately')
assert.equal(accounting.sample(profile, 10).runtimeDeltaBytes, 160, 'duplicate snapshots never double count')
const refreshed = { ...profile, lastFetchedAt: 2, userInfo: { total: 1000, download: 260 } }
assert.equal(accounting.sample(refreshed, 20).runtimeDeltaBytes, 0, 'server refresh establishes a new baseline')
assert.equal(accounting.sample(refreshed, 25).runtimeDeltaBytes, 5)
const other = { ...profile, id: 'two' }
assert.equal(accounting.sample(other, 30).runtimeDeltaBytes, 0)
assert.equal(accounting.sample(other, 40).runtimeDeltaBytes, 10)
assert.equal(accounting.sample(refreshed, 45).runtimeDeltaBytes, 5, 'returning to a profile retains its own delta')
assert.equal(accounting.sample(refreshed, 50).runtimeDeltaBytes, 10)
console.log('PASS: subscription traffic survives navigation, renderer recreation and core restarts; server snapshots and profiles stay isolated')
