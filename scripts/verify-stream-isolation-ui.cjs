// Stream and interaction fixtures verify which controls actually re-render.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let polls = 0
    const getConnections = api.mihomo.getConnections
    api.mihomo.getConnections = async () => { polls++; return getConnections() }
    api.uiTest.connectionPolls = async () => polls
    const delays = new Map()
    let holdDelays = false
    api.uiTest.holdDelays = async () => { holdDelays = true }
    api.mihomo.testDelay = name => holdDelays ? new Promise(resolve => delays.set(name, resolve)) : Promise.resolve(42)
    api.uiTest.pendingDelays = async () => [...delays.keys()]
    api.uiTest.finishDelay = async name => { delays.get(name)?.(42); delays.delete(name) }
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  app.setPath('userData', path.resolve(__dirname, '../artifacts/stream-isolation-ui/user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1100, height: 760,
      webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code).catch(error => { throw new Error(`${error.message}\n${code}`) })
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const waitFor = async code => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await evaluate(code)) return
        await delay(50)
      }
      throw new Error(`Timed out: ${code}`)
    }
    const navigate = async name => {
      await evaluate(`document.querySelector('[aria-label="${name}"]').click()`)
      await waitFor(`document.querySelector('h1')?.textContent === '${name}'`)
    }
    const remember = (name, expression) => evaluate(`{
      const node = ${expression};
      const key = Object.keys(node).find(key => key.startsWith('__reactProps$'));
      window.renderSnapshots[${JSON.stringify(name)}] = { node, key, props: node[key] };
      true;
    }`)
    const unchanged = name => evaluate(`{
      const { node, key, props } = window.renderSnapshots[${JSON.stringify(name)}];
      node.isConnected && node[key] === props;
    }`)
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`!!document.querySelector('.overview-power:not(:disabled)')`)
      await evaluate('window.renderSnapshots = {}; true')
      await delay(300)
      await remember('power', `document.querySelector('.overview-power')`)
      await remember('metrics', `document.querySelector('.overview-traffic')`)
      const polls = await evaluate('window.api.uiTest.connectionPolls()')
      await waitFor(`window.api.uiTest.connectionPolls().then(count => count > ${polls})`)
      assert.equal(await unchanged('power'), true, 'traffic and connection polls do not render the dashboard controls')
      assert.equal(await unchanged('metrics'), false, 'live traffic still updates the metrics')

      if (!process.argv.includes('--connections-only')) {
        await navigate('Proxy groups')
        await waitFor(`document.querySelectorAll('button[aria-pressed][aria-label^="Select "]').length > 6`)
        await evaluate('window.api.uiTest.holdDelays()')
        await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Test Latency')).click()`)
        await waitFor('window.api.uiTest.pendingDelays().then(names => names.length >= 6)')
        await delay(50)
        await remember('pendingNode', `Array.from(document.querySelectorAll('button[aria-pressed][aria-label^="Select "]')).at(-1)`)
        const pendingNames = await evaluate('window.api.uiTest.pendingDelays()')
        await remember('finishedNode', `document.querySelector('button[aria-pressed][aria-label^="Select "]')`)
        await evaluate(`window.api.uiTest.finishDelay(${JSON.stringify(pendingNames[0])})`)
        await waitFor(`{ const { node, key, props } = window.renderSnapshots.finishedNode; node[key] !== props }`)
        assert.equal(await unchanged('pendingNode'), true, 'a latency result does not render an unchanged node card')

      }

      await navigate('Connections')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'All connections').click()`)
      await waitFor(`document.querySelectorAll('[aria-label="Close connection"]').length > 1`)
      await evaluate(`document.querySelector('[aria-label="Pause live updates"]').click()`)
      await waitFor(`!!document.querySelector('[aria-label="Resume live updates"]')`)
      await remember('otherConnection', `document.querySelectorAll('[aria-label="Close connection"]')[1]`)
      await remember('toolbar', `document.querySelector('[aria-label="Resume live updates"]')`)
      const pausedPolls = await evaluate('window.api.uiTest.connectionPolls()')
      await evaluate('window.api.uiTest.increaseTraffic()')
      await waitFor(`window.api.uiTest.connectionPolls().then(count => count > ${pausedPolls})`)
      await delay(100)
      assert.equal(await unchanged('toolbar'), true, 'polling continues without rendering the paused view')
      assert.equal(await unchanged('otherConnection'), true, 'a paused connection row stays frozen across live snapshots')
      await evaluate(`document.querySelector('[aria-label="Copy"]').click()`)
      await waitFor(`!!document.querySelector('[aria-label="Copied"]')`)
      assert.equal(await unchanged('otherConnection'), true, 'copying a host does not render another connection')
      assert.equal(await unchanged('toolbar'), true, 'copy feedback does not render page controls')
      await evaluate(`document.querySelector('[aria-label="Close connection"]').closest('.group').click()`)
      await waitFor(`!!document.querySelector('[role="dialog"]')`)
      await remember('dialogFooter', `Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === 'Close connection')`)
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] div')).find(el => el.classList.contains('group/chainline')).querySelector('button').click()`)
      await waitFor(`!!document.querySelector('[role="dialog"] [aria-label="Copied"]')`)
      assert.equal(await unchanged('dialogFooter'), true, 'copying the route only renders its section')
      console.log('PASS: dashboard stream isolation, frozen connection view with active polling and local copy feedback' +
        (process.argv.includes('--connections-only') ? '' : ', unchanged proxy node memoization'))
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
