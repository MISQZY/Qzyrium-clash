const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')
const { activateProfile } = loadTypeScript('src/main/utils/activate-profile.ts', { './logger': { logger: { error() {} } } })

async function verify() {
  let active = 'old', runtime = 'old', reject = true, running = true
  const events = []
  const profiles = { getActiveProfile: () => ({ id: active }), setActiveProfile: async id => { active = id; events.push('select:' + id) } }
  const kernel = { getStatus: () => running ? 'running' : 'stopped', reloadConfig: async () => {
    events.push('reload:' + active)
    if (reject) throw new Error('Reload rejected')
    runtime = active
  } }
  await assert.rejects(activateProfile(profiles, kernel, 'new'), /Reload rejected/)
  assert.equal(active, 'old')
  assert.equal(runtime, 'old')
  reject = false
  await activateProfile(profiles, kernel, 'new')
  assert.equal(runtime, 'new', 'the same selection can be retried after rollback')
  events.length = 0
  await Promise.all([activateProfile(profiles, kernel, 'one'), activateProfile(profiles, kernel, 'two')])
  assert.deepEqual(events, ['select:one', 'reload:one', 'select:two', 'reload:two'])
  running = false
  events.length = 0
  await activateProfile(profiles, kernel, 'offline')
  assert.deepEqual(events, ['select:offline'])
  console.log('PASS: shared tray/IPC profile activation rollback, retry, serialization and offline selection')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
