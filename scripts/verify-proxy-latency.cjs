const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')

const flush = () => new Promise(resolve => setImmediate(resolve))

async function run() {
  const slots = [], effects = []
  let cursor = 0
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, value => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value
      }]
    },
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index] },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
        const previous = slots[index]
        slots[index] = { deps }
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn() })
      }
    }
  }
  const requests = [], updates = []
  let active = 0, maximum = 0
  const previousWindow = global.window
  global.window = { api: { mihomo: { testDelay: name => {
    maximum = Math.max(maximum, ++active)
    return new Promise(resolve => requests.push({ name, resolve: value => { active--; resolve(value) } }))
  } } } }
  const { useProxyLatency } = loadTypeScript('src/renderer/src/hooks/useProxyLatency.ts', { react })
  const options = { running: true, proxies: {}, concurrency: 2, onUpdateDelays: batch => updates.push(batch) }
  function render() {
    cursor = 0
    const result = useProxyLatency(options)
    while (effects.length) effects.shift()()
    return result
  }
  const finish = (name, delay) => requests.find(request => request.name === name).resolve(delay)
  try {
    let view = render()
    const first = view.testGroup('first', ['a', 'shared', 'slow'])
    const second = view.testGroup('second', ['shared', 'b'])
    await view.testGroup('first', ['duplicate'])
    await view.testAll(['blocked'])
    view = render()
    assert.deepEqual([...view.testingGroups], ['first', 'second'], 'groups can run together')
    assert.deepEqual(requests.map(request => request.name), ['a', 'shared'])
    finish('a', 10)
    await flush()
    assert.deepEqual(requests.map(request => request.name), ['a', 'shared', 'b'], 'another group starts before the first finishes')
    finish('shared', 20)
    await flush()
    finish('b', 30)
    await second
    view = render()
    assert.deepEqual([...view.testingGroups], ['first'], 'finished group clears only its own spinner')
    assert.equal(view.testingNodes.has('slow'), true)
    finish('slow', 40)
    await first
    view = render()
    assert.equal(view.testingGroups.size, 0)
    assert.equal(view.testingNodes.size, 0)
    assert.equal(maximum, 2, 'all groups share the configured request limit')
    assert.equal(requests.filter(request => request.name === 'shared').length, 1, 'overlapping groups share an in-flight node test')
    assert.deepEqual(Object.assign({}, ...updates), { a: 10, shared: 20, b: 30, slow: 40 })

    const all = view.testAll(['all'])
    await view.testGroup('blocked', ['blocked'])
    assert.equal(render().testingAll, true)
    finish('all', 50)
    await all
    assert.equal(render().testingAll, false)

    const old = view.testGroup('old', ['old-a', 'old-b', 'not-started'])
    const queued = view.testGroup('queued', ['queued'])
    options.proxies = {}
    render()
    view = render()
    assert.equal(view.testingGroups.size, 0, 'changing the proxy catalog resets testing')
    const fresh = view.testGroup('fresh', ['fresh'])
    const updateCount = updates.length
    finish('old-a', 100)
    finish('old-b', 100)
    await Promise.all([old, queued])
    assert.equal(updates.length, updateCount, 'old IPC results cannot publish into the new catalog')
    assert.equal(requests.some(request => ['not-started', 'queued'].includes(request.name)), false, 'catalog change discards queued requests')
    assert.deepEqual([...render().testingGroups], ['fresh'], 'old completion cannot clear a newer test')
    finish('fresh', 60)
    await fresh
    options.running = false
    render()
    const offline = render().testGroup('offline', ['offline'])
    assert.equal(requests.some(request => request.name === 'offline'), true, 'offline latency testing may start the idle core')
    finish('offline', 70)
    await offline
    for (const slot of slots) slot?.cleanup?.()
    console.log('PASS: concurrent groups, shared request limit, node deduplication, independent progress, test-all exclusion and stale-result protection')
  } finally {
    global.window = previousWindow
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
