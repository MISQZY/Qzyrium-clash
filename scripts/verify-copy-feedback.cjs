const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')

async function verify() {
  let activeHost
  const requests = []
  const timers = new Map()
  let nextTimer = 0
  const react = {
    useState(initial) {
      const host = activeHost, index = host.cursor++
      host.slots[index] ??= { value: initial }
      return [host.slots[index].value, value => { host.writes++; host.slots[index].value = value }]
    },
    useRef(value) {
      const host = activeHost, index = host.cursor++
      host.slots[index] ??= { current: value }
      return host.slots[index]
    },
    useCallback(fn) {
      const host = activeHost, index = host.cursor++
      return host.slots[index] ??= fn
    },
    useEffect(effect) {
      const host = activeHost, index = host.cursor++
      host.slots[index] ??= { cleanup: effect() }
    }
  }
  const { useCopyFeedback } = loadTypeScript('src/renderer/src/hooks/useCopyFeedback.ts', {
    react, '../lib/clipboard': { copyToClipboard: () => new Promise(resolve => requests.push(resolve)) }
  })
  const host = () => ({ slots: [], cursor: 0, writes: 0 })
  const render = target => { activeHost = target; target.cursor = 0; return useCopyFeedback() }
  const unmount = target => target.slots.forEach(slot => slot?.cleanup?.())
  const originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout
  global.setTimeout = (fn, ms) => { assert.equal(ms, 1800); timers.set(++nextTimer, fn); return nextTimer }
  global.clearTimeout = id => timers.delete(id)
  try {
    const a = host(), b = host()
    const first = render(a).handleCopy('first', 'first')
    requests.shift()(true)
    await first
    assert.equal(render(a).copiedKey, 'first')
    assert.equal(render(b).copiedKey, null, 'copy feedback belongs only to the initiating control')
    const old = render(a).handleCopy('old', 'old')
    const latest = render(a).handleCopy('latest', 'latest')
    const resolveOld = requests.shift(), resolveLatest = requests.shift()
    resolveLatest(true)
    await latest
    resolveOld(true)
    await old
    assert.equal(render(a).copiedKey, 'latest', 'a slow clipboard response cannot replace newer feedback')
    assert.equal(timers.size, 1, 'a repeated copy replaces the previous reset timer')
    for (const [id, callback] of timers) { timers.delete(id); callback() }
    assert.equal(render(a).copiedKey, null, 'feedback expires')
    const failed = render(a).handleCopy('failed', 'failed')
    requests.shift()(false)
    await failed
    assert.equal(render(a).copiedKey, null, 'failed copies do not show success')
    const pending = render(a).handleCopy('pending', 'pending')
    const writesBeforeUnmount = a.writes
    unmount(a)
    requests.shift()(true)
    await pending
    assert.equal(a.writes, writesBeforeUnmount, 'clipboard completion cannot update an unmounted control')
    assert.equal(timers.size, 0)
    const copied = render(b).handleCopy('second', 'second')
    requests.shift()(true)
    await copied
    assert.equal(timers.size, 1)
    unmount(b)
    assert.equal(timers.size, 0, 'unmount cancels the pending feedback timer')
    console.log('PASS: independent copy feedback, expiry, repeat copies, stale results, failure and unmount cleanup')
  } finally { global.setTimeout = originalSetTimeout; global.clearTimeout = originalClearTimeout }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
