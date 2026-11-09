// Run after building: electron scripts/verify-ui.cjs
// Uses an isolated preload fixture. Never starts Mihomo or changes system proxy.
const { app, BrowserWindow, contextBridge } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

if (process.type === 'renderer') {
  let settings = {
    general: { autoStart: false, autoConnect: true, minimizeToTray: true, theme: 'dark', language: 'en' },
    kernel: { mode: 'rule', logLevel: 'info', mixedPort: 7895, controllerPort: 9095, controllerSecret: 'test-only', allowLan: false, tun: { enable: false, stack: 'system', autoRoute: true, strictRoute: false, dnsHijack: ['any:53'] } },
    sysProxy: { enable: false, bypass: ['localhost', '127.*'] }, activeProfileId: 'remote'
  }
  let state = 'running'
  let sessionStartedAt = Date.now() - 3600000
  let trafficCallback, statusCallback
  const profiles = [
    { id: 'remote', name: 'Europe · Primary subscription', type: 'remote', url: 'https://example.com/subscription/' + 'long-path-'.repeat(60), updatedAt: Date.now() },
    { id: 'long', name: 'A very long profile name '.repeat(20), type: 'local', updatedAt: Date.now() }
  ]
  let active = profiles[0]
  const nodes = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`Node ${i + 1} · ${i % 2 ? 'Frankfurt' : 'Amsterdam'}${i === 0 ? ' 🇳🇱 🚀' : ''}`, { name: `Node ${i + 1}`, type: 'VLESS', udp: true, history: [] }]))
  const proxies = { ...nodes, PROXY: { name: 'PROXY', type: 'Selector', udp: true, history: [], all: Object.keys(nodes), now: Object.keys(nodes)[0] } }
  const rules = Array.from({ length: 210 }, (_, i) => ({ type: i % 2 ? 'DomainSuffix' : 'IPCIDR', payload: i % 2 ? `service-${i}.example.com` : `10.${i}.0.0/16`, proxy: 'PROXY' }))
  let connections = Array.from({ length: 8 }, (_, i) => ({ id: String(i), metadata: { network: 'tcp', type: 'HTTP', sourceIP: '127.0.0.1', destinationIP: '203.0.113.1', sourcePort: '51234', destinationPort: '443', host: i ? `service-${i}.example.com` : 'a-very-long-hostname-'.repeat(12) + '.example.com', processPath: 'C:\\Program Files\\Example\\browser.exe', dnsMode: 'normal' }, upload: 12345, download: 12345678, start: new Date().toISOString(), chains: ['PROXY', Object.keys(nodes)[0]], rule: 'DomainSuffix', rulePayload: 'example.com' }))
  const noop = async () => {}
  contextBridge.exposeInMainWorld('api', {
    kernel: { getStatus: async () => state, getSessionStartedAt: async () => state === 'running' ? sessionStartedAt : null, start: async () => { sessionStartedAt = Date.now(); state = 'running'; statusCallback?.(state) }, stop: async () => { state = 'stopped'; statusCallback?.(state); trafficCallback?.({ up: 0, down: 0 }) }, restart: async () => { sessionStartedAt = Date.now(); state = 'running'; statusCallback?.(state) }, getVersion: async () => ({ version: 'test', meta: true }) },
    settings: { get: async () => settings, update: async (patch) => { settings = { ...settings, ...patch }; return settings } },
    sysproxy: { getStatus: async () => ({ enabled: settings.sysProxy.enable, mode: 'manual', port: settings.kernel.mixedPort }), set: async (enable) => { settings.sysProxy.enable = enable } },
    profiles: { getList: async () => profiles, getActive: async () => active, setActive: async (id) => { active = profiles.find((profile) => profile.id === id) }, add: async (dto) => { const profile = { ...dto, name: dto.name || 'Imported subscription', nameSource: dto.name ? 'manual' : 'subscription', id: String(Date.now()), updatedAt: Date.now() }; profiles.push(profile); return profile }, delete: async (id) => { profiles.splice(profiles.findIndex((profile) => profile.id === id), 1) }, update: noop, getCustomRules: async () => active?.customRules || [], saveCustomRules: async (_, list) => { if (active) active.customRules = list }, getRawConfig: async () => 'rules:\n  - MATCH,DIRECT', saveRawConfig: noop, updateInfo: async (id, patch) => { const p = profiles.find(x => x.id === id); if (p) Object.assign(p, patch); return p } },
    mihomo: { getGlobeLocations: async () => active.id === 'long' ? { origin: null, routes: [], status: 'origin-unavailable', pendingNodes: [Object.keys(nodes)[0]] } : ({ origin: { ip: '8.8.8.8', longitude: 37.62, latitude: 55.75, city: 'Moscow', country: 'Russia' }, routes: state === 'running' ? [{ node: Object.keys(nodes)[0], location: { ip: '1.1.1.1', longitude: 4.9, latitude: 52.37, city: 'Amsterdam', country: 'Netherlands' } }] : [] }), getConfigs: async () => ({ mode: settings.kernel.mode }), patchConfigs: noop, getProxies: async () => proxies, selectProxy: async (group, node) => { proxies[group].now = node }, testDelay: async () => 42, getRules: async () => rules, getConnections: async () => ({ uploadTotal: 123456789, downloadTotal: 2345678910, connections }), closeConnection: async (id) => { connections = connections.filter((item) => item.id !== id) }, closeAllConnections: async () => { connections = [] } },
    window: { minimize: noop, maximize: noop, close: noop, openFolder: noop },
    app: { getVersion: async () => '0.1.0', isElevated: async () => false, checkUpdates: async () => ({ state: 'not-available' }) },
    events: { onTraffic: (cb) => { trafficCallback = cb; const timer = setInterval(() => cb(state === 'running' ? { up: 12345, down: 4567890 } : { up: 0, down: 0 }), 100); return () => { clearInterval(timer); trafficCallback = undefined } }, onCoreStatus: (cb) => { statusCallback = cb; return () => { statusCallback = undefined } }, onLog: (cb) => { const timer = setTimeout(() => { for (let i = 0; i < 30; i++) cb({ type: i % 3 ? 'info' : 'warn', payload: `Connection ${i} to service.example.com ` + 'long-payload-'.repeat(30), time: '12:34:56' }) }, 300); return () => clearTimeout(timer) } }
  })
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  process.chdir(output)
  app.commandLine.appendSwitch('disable-features', 'WinUseBrowserSpellChecker')
  app.commandLine.appendSwitch('disable-spellcheck')
  const result = { checks: [], errors: [] }
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1040, height: 720, show: false, titleBarStyle: 'hidden', titleBarOverlay: { height: 36, color: '#00000000', symbolColor: '#9ca3af' }, webPreferences: { spellcheck: false, preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    // Deterministic emoji asset fixture: UI checks must not depend on a CDN.
    const emojiFixture = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><path fill="#ae1c28" d="M0 0h24v6H0z"/><path fill="#fff" d="M0 6h24v6H0z"/><path fill="#21468b" d="M0 12h24v6H0z"/></svg>'
    win.webContents.session.protocol.handle('https', request => request.url.startsWith('https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg/')
      ? new Response(emojiFixture, { headers: { 'Content-Type': 'image/svg+xml' } })
      : new Response('', { status: 404 }))
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3 || message.includes('Insecure Content-Security-Policy')) result.errors.push(message) })
    win.webContents.on('render-process-gone', (_event, details) => result.errors.push(details.reason))
    const evaluate = (code) => win.webContents.executeJavaScript(code)
    const setControl = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (input instanceof HTMLSelectElement) { input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', { bubbles: true })); } else { const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); } })()`)
    const waitFor = async (code) => { for (let i = 0; i < 60; i++) { if (await evaluate(code)) return; await delay(50) } throw new Error(`Timed out: ${code}`) }
    const labelToTab = {
      'System proxy': 'sysproxy', 'Системный прокси': 'sysproxy',
      'TUN interface': 'tun', 'Интерфейс TUN': 'tun',
      'DNS': 'dns',
      'Sniffer': 'sniffer', 'Сниффер': 'sniffer',
      'Resources': 'resources', 'Ресурсы': 'resources',
      'Mihomo core': 'mihomo', 'Ядро Mihomo': 'mihomo'
    }
    const navigate = async (label) => {
      const target = labelToTab[label]
      if (target) {
        const onSettings = await evaluate(`document.querySelector('h1')?.textContent === 'Settings' || document.querySelector('h1')?.textContent === 'Настройки'`)
        if (!onSettings) {
          await evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === 'Settings' || el.textContent.trim() === 'Настройки' || el.getAttribute('aria-label') === 'Settings' || el.getAttribute('aria-label') === 'Настройки')?.click()`)
          await delay(70)
          await waitFor(`document.querySelector('h1')?.textContent === 'Settings' || document.querySelector('h1')?.textContent === 'Настройки'`)
        }
        await evaluate(`document.querySelector('[data-nav-target="${target}"]')?.click()`)
      } else {
        await evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === ${JSON.stringify(label)} || el.getAttribute('aria-label') === ${JSON.stringify(label)})?.click()`)
      }
      await delay(70)
      await waitFor(`document.querySelector('h1')?.textContent === ${JSON.stringify(label)}`)
      const breadcrumb = await evaluate(`({ group: document.querySelector('.workspace-header nav li:first-child').textContent.trim(), page: document.querySelector('.workspace-header nav [aria-current="page"]').textContent.trim(), locale: document.documentElement.lang })`)
      const networkPages = ['System proxy', 'TUN interface', 'DNS', 'Sniffer', 'Resources', 'Системный прокси', 'Интерфейс TUN', 'Сниффер', 'Ресурсы']
      const applicationPages = ['Mihomo core', 'Settings', 'Ядро Mihomo', 'Настройки']
      const group = networkPages.includes(label) ? ['Network', 'Сеть'] : applicationPages.includes(label) ? ['Application', 'Приложение'] : ['Workspace', 'Рабочая область']
      assert.equal(breadcrumb.group, group[breadcrumb.locale === 'ru' ? 1 : 0], `${label}: breadcrumb group`)
      assert.equal(breadcrumb.page, label, `${label}: breadcrumb page`)
      if (await evaluate(`!!document.querySelector('.globe-canvas')`)) {
        await waitFor(`(() => { const canvas = document.querySelector('.globe-canvas'); return canvas?.dataset.globeReady === 'true' })()`)
      }
    }
    const screenshot = async (name) => {
      await delay(250)
      fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
    }
    try {
      await win.webContents.session.clearStorageData()
      const load = async () => {
        if (process.env.UI_RENDERER_URL) await win.loadURL(process.env.UI_RENDERER_URL)
        else await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
        // Hidden windows can pause compositor transitions. Assert the final sidebar layout directly.
        await win.webContents.insertCSS('.app-sidebar { transition: none !important; }')
      }
      await load()
      await waitFor(`document.querySelector('h1')?.textContent === 'Home' && document.querySelector('.overview-power[aria-pressed="true"]') !== null`)
      await waitFor(`document.querySelector('.overview-session-duration')?.textContent.startsWith('01:00:')`)
      assert.equal(await evaluate(`document.querySelector('.overview-power-section [role="status"]').textContent`), 'Connected')
      assert.ok(await evaluate(`document.querySelector('.overview-power').getBoundingClientRect().width >= 128`))
      assert.equal(await evaluate(`document.querySelector('.overview-panel-section').textContent.includes('Connections')`), false)
      assert.equal(await evaluate(`document.querySelector('.overview-power-section .overview-status-detail')`), null)
      result.checks.push('Home has a larger power button, concise state and real session uptime without connection counts')
      await waitFor(`document.querySelector('.globe-route-summary')`)
      await evaluate(`document.querySelectorAll('.globe-route-summary .name-emoji img').forEach(img => { img.loading = 'eager' })`)
      await waitFor(`document.querySelector('.globe-route-summary .name-emoji-ready[data-fallback="NL"] img')?.naturalWidth > 0`)
      assert.ok(await evaluate(`document.querySelector('.globe-route-summary .name-emoji-ready img')?.src.includes('/1f1f3-1f1f1.svg')`), 'Home renders country flags using the emoji image renderer')
      result.checks.push('Home country flags render in tunnel summaries')
      assert.ok(await evaluate(`document.querySelector('.globe-route-summary .globe-route-latency')?.textContent.includes('42 ms')`), 'tunnel summary shows measured latency')
      assert.ok(await evaluate(`document.querySelector('.overview-map-notes').getBoundingClientRect().top >= document.querySelector('.overview-panel').getBoundingClientRect().bottom`), 'map hints are below the right panel')
      assert.equal(await evaluate(`document.querySelector('.globe-footer > p')`), null)
      await waitFor(`(() => { const canvas = document.querySelector('.globe-canvas'); return canvas?.dataset.globeReady === 'true' })()`)
      // The globe releases its drawing buffer after composition. Inspect the
      // composed frame instead of relying on preserveDrawingBuffer=true.
      const canvasBounds = await evaluate(`(() => { const canvas = document.querySelector('.globe-canvas'); const rect = canvas.getBoundingClientRect(); return { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.width), height: Math.ceil(rect.height), painted: canvas.width > 1 && canvas.height > 1 && Number(canvas.dataset.frameCount) > 0 }; })()`)
      assert.ok(canvasBounds.painted, 'globe has a rendered canvas, not a 1px placeholder')
      const globePixels = (await win.webContents.capturePage({ x: canvasBounds.x, y: canvasBounds.y, width: canvasBounds.width, height: canvasBounds.height })).toBitmap()
      const globeColors = new Set()
      for (let i = 0; i < globePixels.length; i += 16) globeColors.add(globePixels.subarray(i, i + 3).toString('hex'))
      assert.ok(globeColors.size > 32, 'composed globe contains painted detail')
      await waitFor(`document.querySelector('.globe-route-track')?.getAttribute('d')?.length > 40`)
      await evaluate(`document.querySelector('.globe-route-hit').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`)
      await waitFor(`document.querySelector('.globe-route-dash.is-active') !== null`)
      await evaluate(`document.querySelector('.globe-route-hit').dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))`)
      await evaluate(`document.querySelector('.globe-route-summary').click()`)
      await waitFor(`document.querySelector('.globe-route-summary').getAttribute('aria-pressed') === 'true'`)
      await evaluate(`document.querySelector('.globe-route-summary').click()`)
      await navigate('Profiles')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Select').click()`)
      await waitFor(`document.querySelector('.workspace-header').textContent.includes('A very long profile name')`)
      await navigate('Home')
      await waitFor(`document.querySelector('.overview-map-notes').textContent.includes('Could not locate your public IP') && document.querySelector('.globe-pending-node') !== null`)
      await waitFor(`document.querySelectorAll('.globe-route-track').length === 0`)
      await navigate('Profiles')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Select').click()`)
      await waitFor(`document.querySelector('.workspace-header').textContent.includes('Europe')`)
      await navigate('Home')
      // Let the new profile, emoji assets and the focused camera settle first.
      let frames = '', stableSince = Date.now(), settled = false
      for (let attempt = 0; attempt < 40; attempt++) {
        await delay(100)
        const next = await evaluate(`document.querySelector('.globe-canvas').dataset.frameCount`)
        if (next !== frames) { frames = next; stableSince = Date.now() }
        if (Date.now() - stableSince >= 500) { settled = true; break }
      }
      assert.ok(settled, 'globe must stop redrawing after the profile and assets settle')
      assert.equal(await evaluate(`document.querySelector('.globe-reset')`), null)
      assert.ok(await evaluate(`(() => { const scene = document.querySelector('.globe-scene').getBoundingClientRect(); const panel = document.querySelector('.overview-panel').getBoundingClientRect(); return scene.left < panel.left && scene.right >= panel.right - 1 })()`), 'globe extends under the panel')
      result.checks.push('COBE globe is painted, stays idle and supports route hover and pinning')
      result.checks.push('Home shows GeoIP endpoints and measured latency; Profiles switches the active profile')
      await waitFor(`document.querySelector('.app-titlebar img')?.complete && document.querySelector('.app-titlebar img').naturalWidth > 0`)
      assert.equal(await evaluate(`document.querySelector('.app-sidebar .sidebar-brand')`), null)
      result.checks.push('RemnaWEB druse loads in titlebar; sidebar has no duplicate branding')
      const pages = ['Home', 'Proxy groups', 'Profiles', 'Connections', 'Rules', 'Logs', 'System proxy', 'TUN interface', 'DNS', 'Sniffer', 'Resources', 'Mihomo core', 'Settings']
      for (const [width, height] of [[840, 560], [1040, 720], [1440, 900], [900, 600], [840, 560]]) {
        win.setSize(width, height)
        await delay(100)
        for (const label of pages) {
          await navigate(label)
          const layout = await evaluate(`(() => { const root = document.documentElement; const main = document.querySelector('.app-main'); const sidebar = document.querySelector('.app-sidebar'); const viewport = document.querySelector('.page-viewport'); const page = document.querySelector('.page-scroll'); return { width: innerWidth, height: innerHeight, rootWidth: root.scrollWidth, rootHeight: root.scrollHeight, clientWidth: root.clientWidth, clientHeight: root.clientHeight, bodyOverflow: root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1, mainOverflow: main.scrollWidth > main.clientWidth + 1, pageOverflow: page ? page.scrollWidth > page.clientWidth + 1 : false, aligned: Math.abs(main.getBoundingClientRect().top - sidebar.getBoundingClientRect().top) < 1, bottom: Math.abs(viewport.getBoundingClientRect().bottom - innerHeight) < 1 } })()`)
          assert.equal(layout.bodyOverflow, false, `${width}×${height} ${label}: body overflow ${JSON.stringify(layout)}`)
          assert.equal(layout.mainOverflow, false, `${width}×${height} ${label}: workspace overflow`)
          assert.equal(layout.pageOverflow, false, `${width}×${height} ${label}: page overflow`)
          assert.ok(layout.aligned && layout.bottom, `${width}×${height} ${label}: misaligned shell`)
          result.checks.push(`${width}x${height} ${label}`)
        }
        await navigate('Home')
        assert.ok(await evaluate(`(() => {
          const scene = document.querySelector('.globe-scene'), style = getComputedStyle(scene);
          const available = scene.clientWidth - parseFloat(style.getPropertyValue('--overview-reserved'));
          const x = parseFloat(style.getPropertyValue('--globe-cx')), y = parseFloat(style.getPropertyValue('--globe-cy')), r = parseFloat(style.getPropertyValue('--globe-radius'));
          return Math.abs(x - available / 2) < 1 && x - r >= 0 && x + r <= available && y - r >= 0 && y + r <= scene.clientHeight;
        })()`), 'planet is centered in free space and its whole silhouette fits')
        if (width === 840 || width === 1440) await screenshot(`overview-${width}`)
      }
      await navigate('DNS')
      await evaluate(`document.querySelector('[aria-label="Override subscription settings"]').click()`)
      await setControl('#dns-enable', 'true')
      await setControl('#dns-nameserver', 'https://1.1.1.1/dns-query\nhttps://dns.google/dns-query')
      await setControl('#dns-nameserver-policy', '[1, 2]')
      assert.equal(await evaluate(`document.querySelector('#dns-nameserver-policy').checkValidity()`), false, 'DNS policy must be a YAML mapping')
      await setControl('#dns-nameserver-policy', 'example.com: 1.1.1.1')
      await evaluate(`document.querySelector('button[form="override-dns"]').click()`)
      await waitFor(`document.querySelector('button[form="override-dns"]').disabled`)
      assert.deepEqual(await evaluate(`window.api.settings.get().then(s => s.kernel.dns.nameserver)`), ['https://1.1.1.1/dns-query', 'https://dns.google/dns-query'])
      await navigate('Sniffer')
      await navigate('DNS')
      assert.equal(await evaluate(`document.querySelector('#dns-enable').value`), 'true', 'DNS values survive page changes')
      await evaluate(`document.querySelector('[aria-label="Override subscription settings"]').click()`)
      await evaluate(`document.querySelector('button[form="override-dns"]').click()`)
      await waitFor(`document.querySelector('button[form="override-dns"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.kernel.dns)`), null, 'turning off an override returns control to the subscription')
      result.checks.push('DNS editing validates YAML, persists values and restores subscription inheritance')
      await navigate('Sniffer')
      await evaluate(`document.querySelector('[aria-label="Override subscription settings"]').click()`)
      await setControl('#sniffer-enable', 'true')
      await setControl('#sniffer-sniff', 'TLS:\n  ports: [443]\nQUIC:\n  ports: [443]')
      await evaluate(`document.querySelector('button[form="override-sniffer"]').click()`)
      await waitFor(`document.querySelector('button[form="override-sniffer"]').disabled`)
      assert.deepEqual(await evaluate(`window.api.settings.get().then(s => s.kernel.sniffer.sniff.TLS.ports)`), [443])
      await navigate('Resources')
      await evaluate(`document.querySelector('[aria-label="Override subscription settings"]').click()`)
      await setControl('#resources-geo-auto-update', 'true')
      await setControl('#resources-geo-update-interval', '48')
      await setControl('#resources-profile', 'store-selected: true\nstore-fake-ip: true')
      await evaluate(`document.querySelector('button[form="override-resources"]').click()`)
      await waitFor(`document.querySelector('button[form="override-resources"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.kernel.resources['geo-update-interval'])`), 48)
      result.checks.push('Sniffer protocols, geodata update settings and profile cache are editable and saved')
      await navigate('TUN interface')
      await setControl('#tun-options-mtu', '1400')
      await setControl('#tun-options-route-exclude-address', '192.168.0.0/16\n10.0.0.0/8')
      await evaluate(`document.querySelector('button[form="settings-tun"]').click()`)
      await waitFor(`document.querySelector('button[form="settings-tun"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.kernel.tun.options.mtu)`), 1400)
      await navigate('Mihomo core')
      await setControl('#core-options-ipv6', 'false')
      await setControl('#core-options-tcp-concurrent', 'true')
      await evaluate(`document.querySelector('button[form="settings-mihomo"]').click()`)
      await waitFor(`document.querySelector('button[form="settings-mihomo"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.kernel.options['tcp-concurrent'])`), true)
      await navigate('System proxy')
      await setControl('[aria-label="System proxy mode"]', 'pac')
      await setControl('[aria-label="Custom PAC script"]', 'function FindProxyForURL(url, host) { return "DIRECT"; }')
      await evaluate(`document.querySelector('button[form="settings-sysproxy"]').click()`)
      await waitFor(`document.querySelector('button[form="settings-sysproxy"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.sysProxy.mode)`), 'pac')
      await navigate('Settings')
      await setControl('#general-delayTestTimeout', '7000')
      await setControl('#general-userAgent', 'Qzyrium fixture agent')
      await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
      await waitFor(`document.querySelector('button[form="settings-settings"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.general.delayTestTimeout)`), 7000)
      await setControl('#general-userAgent', '')
      await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
      await waitFor(`document.querySelector('button[form="settings-settings"]').disabled`)
      assert.equal(await evaluate(`window.api.settings.get().then(s => s.general.userAgent)`), 'Qzyrium-clash', 'clearing a client preference restores its effective default')
      result.checks.push('Advanced TUN/core, PAC and client preferences serialize through the settings form')
      await navigate('Home')
      await waitFor(`document.querySelector('.overview-session-duration')?.textContent.startsWith('01:00:')`)
      await evaluate(`window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))`)
      assert.ok(await evaluate(`document.querySelector('.overview-session-duration').textContent.startsWith('01:00:')`), 'navigation and visibility changes do not reset the session clock')
      const sessionBeforePause = await evaluate(`document.querySelector('.overview-session-duration').textContent`)
      await evaluate(`window.__clockBeforePause = Date.now; Date.now = () => window.__clockBeforePause() + 65000; document.dispatchEvent(new Event('visibilitychange'))`)
      await waitFor(`document.querySelector('.overview-session-duration').textContent !== ${JSON.stringify(sessionBeforePause)}`)
      const seconds = text => text.split(':').reduce((total, value) => total * 60 + Number(value), 0)
      assert.ok(seconds(await evaluate(`document.querySelector('.overview-session-duration').textContent`)) >= seconds(sessionBeforePause) + 65, 'restoring a throttled window catches up with wall-clock time')
      await evaluate(`Date.now = window.__clockBeforePause; delete window.__clockBeforePause; window.dispatchEvent(new Event('focus'))`)
      assert.ok(await evaluate(`(() => { const state = document.querySelector('.sidebar-vpn-badge').getBoundingClientRect(); const modes = document.querySelector('.sidebar-routing').getBoundingClientRect(); const dot = document.querySelector('.sidebar-vpn-dot'); return state.left < modes.left && dot.getBoundingClientRect().width >= 9 && getComputedStyle(dot).animationName === 'sidebar-vpn-pulse' && getComputedStyle(document.querySelector('.sidebar-vpn-badge')).borderTopWidth === '0px' })()`))
      result.checks.push('Session clock survives navigation/focus; sidebar state is left of modes with a soft pulse')
      await navigate('Proxy groups')
      await waitFor(`document.querySelectorAll('[aria-label^="Select Node"]').length === 18`)
      // Native lazy images do not start loading in a hidden test window.
      await evaluate(`document.querySelectorAll('.name-emoji img').forEach(img => { img.loading = 'eager' })`)
      await waitFor(`document.querySelector('[aria-label^="Select Node"] .name-emoji-ready img')?.naturalWidth > 0`)
      assert.ok(await evaluate(`document.querySelector('[aria-label^="Select Node"]:has(.name-emoji)').getAttribute('aria-label').includes('🇳🇱 🚀')`), 'emoji rendering preserves the original proxy identity')
      await evaluate(`document.querySelector('[aria-label^="Select Node"] .name-emoji[data-fallback="NL"] img').dispatchEvent(new Event('error'))`)
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[aria-label^="Select Node"] .name-emoji-failed'), '::after').content`), '"NL"', 'unavailable flags have a readable offline fallback')
      result.checks.push('Emoji assets render in node names; original Unicode and readable offline flag fallback are preserved')
      await evaluate(`document.querySelectorAll('[aria-label^="Select Node"]')[1].click()`)
      await waitFor(`document.querySelectorAll('[aria-label^="Select Node"]')[1].getAttribute('aria-pressed') === 'true'`)
      await screenshot('proxy-groups')
      result.checks.push('Proxy selection updates active node')
      await navigate('Rules')
      await waitFor(`document.querySelectorAll('tbody tr').length === 100`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Next').click()`)
      await waitFor(`document.querySelector('tbody td').textContent === '101'`)
      result.checks.push('Rule pagination preserves evaluation order')
      await evaluate(`(() => { const input = document.querySelector('[aria-label="Search rules"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'service-11.example.com'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
      await waitFor(`document.querySelectorAll('tbody tr').length === 1`)
      result.checks.push('Rule search filters rows')
      await navigate('System proxy')
      await evaluate(`document.querySelector('[role="switch"][aria-label="System proxy enabled"]').click()`)
      await waitFor(`document.querySelector('[role="switch"][aria-label="System proxy enabled"]').getAttribute('aria-checked') === 'true'`)
      result.checks.push('System proxy toggle reflects saved state')
      await navigate('Settings')
      await evaluate(`(() => { const select = document.querySelector('select[aria-label="Appearance"]'); select.value = 'light'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
      await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
      await waitFor(`!document.documentElement.classList.contains('dark')`)
      result.checks.push('Theme selection persists and applies')
      await screenshot('settings-light')
      await navigate('Profiles')
      assert.equal(await evaluate(`document.querySelector('.page-scroll').textContent.includes('https://example.com/subscription/')`), false, 'subscription links are hidden from cards')
      assert.equal(await evaluate(`performance.getEntriesByType('resource').some(entry => /ProfileEditorDialog[^/]*[.]js/.test(entry.name))`), false, 'editor chunk is not loaded before opening it')
      assert.equal(await evaluate(`document.querySelector('button[aria-label="Edit rules"]').textContent.trim()`), '', 'rules action is an accessible icon button')
      await evaluate(`document.querySelector('button[aria-label="Edit rules"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(button => button.textContent.trim() === 'YAML Mode')`)
      assert.equal(await evaluate(`document.querySelector('[role="dialog"] .monaco-editor')`), null, 'visual rule editing does not mount Monaco')
      assert.equal(await evaluate(`performance.getEntriesByType('resource').some(entry => /(?:YamlEditor|editor[.]worker)[^/]*[.]js/.test(entry.name))`), false, 'visual rule editing does not download Monaco or its worker')
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'YAML Mode').click()`)
      await waitFor(`document.querySelector('[role="dialog"] .monaco-editor') !== null`)
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'Visual Mode').click()`)
      await waitFor(`document.querySelector('[role="dialog"] .monaco-editor') === null`)
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'YAML Mode').click()`)
      await waitFor(`document.querySelector('[role="dialog"] .monaco-editor') !== null`)
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === 'Close').click()`)
      await waitFor(`document.querySelector('[role="dialog"]') === null && document.querySelector('.monaco-editor') === null`)
      result.checks.push('Rules action is icon-only; visual mode skips Monaco and YAML mode loads and unmounts it on demand')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Add Subscription').click()`)
      await waitFor(`document.querySelector('[role="dialog"]') !== null`)
      assert.equal(await evaluate(`document.querySelector('#profile-name').required`), false, 'profile name is optional')
      const dialogFits = await evaluate(`(() => { const rect = document.querySelector('[role="dialog"]').getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth; })()`)
      assert.ok(dialogFits, 'Import dialog must fit the minimum window')
      result.checks.push('Profile import dialog fits 840x560')
      await screenshot('profile-import')
      await evaluate(`(() => { const input = document.querySelector('[role="dialog"] input[required]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'https://example.com/unnamed'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === 'Save Subscription').click()`)
      await waitFor(`document.querySelector('[role="dialog"]') === null`)
      await waitFor(`document.querySelector('.page-scroll').textContent.includes('Imported subscription')`)
      result.checks.push('Subscription imports with an empty name and displays the provider title')
      await navigate('Home')
      await evaluate(`document.querySelector('.sidebar-trigger').click()`)
      await waitFor(`document.querySelector('.app-sidebar').dataset.state === 'collapsed'`)
      await waitFor(`Math.round(document.querySelector('.app-sidebar').getBoundingClientRect().width) === 64`)
      assert.equal(await evaluate(`Math.round(document.querySelector('.app-sidebar').getBoundingClientRect().width)`), 64)
      assert.equal(await evaluate(`localStorage.getItem('sidebar_state')`), 'collapsed')
      await navigate('Rules')
      await waitFor(`document.querySelector('h1').textContent === 'Rules'`)
      await screenshot('sidebar-collapsed')
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))`)
      await waitFor(`document.querySelector('.app-sidebar').dataset.state === 'expanded'`)
      result.checks.push('Sidebar collapses to 64px; icon navigation and Ctrl+B work')
      await evaluate(`document.querySelector('.sidebar-trigger').click()`)
      await waitFor(`localStorage.getItem('sidebar_state') === 'collapsed'`)
      await load()
      await waitFor(`document.querySelector('.app-sidebar')?.dataset.state === 'collapsed'`)
      await evaluate(`document.querySelector('.sidebar-trigger').click()`)
      result.checks.push('Sidebar state survives reload')
      assert.equal(await evaluate(`document.querySelectorAll('.sidebar-group-label button, [aria-controls^="sidebar-group-"]').length`), 0, 'sidebar groups cannot be collapsed')
      assert.equal(await evaluate(`document.querySelectorAll('.sidebar-group').length`), 2, 'sidebar displays two permanently expanded navigation groups')
      result.checks.push('Sidebar groups are permanently expanded with Workspace and Application groups')
      await navigate('TUN interface')
      await evaluate(`Array.from(document.querySelectorAll('header button')).find(el => el.textContent.includes('Back to Settings') || el.textContent.includes('Назад к настройкам'))?.click()`)
      await waitFor(`document.querySelector('h1')?.textContent === 'Settings'`)
      assert.equal(await evaluate(`document.querySelector('h1')?.textContent`), 'Settings', 'Back to Settings returns to Settings page')
      result.checks.push('Sub-settings page has working Back to Settings button')
      await navigate('DNS')
      await evaluate(`Array.from(document.querySelectorAll('header button')).find(el => el.textContent.includes('Back to Settings') || el.textContent.includes('Назад к настройкам'))?.click()`)
      await waitFor(`document.querySelector('h1')?.textContent === 'Settings'`)
      assert.equal(await evaluate(`document.querySelector('h1')?.textContent`), 'Settings', 'Back to Settings from DNS returns to Settings page')
      result.checks.push('Profile override sub-page has working Back to Settings button')
      await evaluate(`document.querySelector('.sidebar-trigger').click()`)
      await waitFor(`document.querySelector('.app-sidebar').dataset.state === 'collapsed'`)
      await navigate('Home')
      await evaluate(`document.querySelector('.sidebar-trigger').click()`)
      await waitFor(`document.querySelector('.app-sidebar').dataset.state === 'expanded'`)
      result.checks.push('Icon sidebar preserves navigation and expands correctly')
      assert.equal(await evaluate(`document.querySelector('.sidebar-footer [aria-label="Interface language"]')`), null)
      assert.equal(await evaluate(`document.querySelector('.sidebar-footer [aria-label="Collapse sidebar"]')`), null)
      await waitFor(`document.querySelector('.sidebar-vpn-badge').dataset.state === 'on'`)
      await evaluate(`document.querySelector('.sidebar-mode[aria-label="Global"]').click()`)
      await waitFor(`document.querySelector('.sidebar-mode[aria-label="Global"]').getAttribute('aria-pressed') === 'true'`)
      await evaluate(`document.querySelector('.sidebar-mode[aria-label="Rules"]').click()`)
      await waitFor(`document.querySelector('.sidebar-mode[aria-label="Rules"]').getAttribute('aria-pressed') === 'true'`)
      await navigate('System proxy')
      await evaluate(`(() => { const control = document.querySelector('[role="switch"][aria-label="System proxy enabled"]'); if (control.getAttribute('aria-checked') === 'true') control.click(); })()`)
      await waitFor(`document.querySelector('[role="switch"][aria-label="System proxy enabled"]').getAttribute('aria-checked') === 'false'`)
      await waitFor(`document.querySelector('.sidebar-vpn-badge').dataset.state === 'on'`)
      await navigate('Home')
      await evaluate(`document.querySelector('button[aria-label="Stop core"]').click()`)
      await waitFor(`document.querySelector('.sidebar-vpn-badge').dataset.state === 'off'`)
      assert.equal(await evaluate(`document.querySelector('.overview-session-duration')`), null, 'timer is hidden when disconnected')
      assert.equal(await evaluate(`document.querySelector('.overview-power-section [role="status"]').textContent`), 'Disconnected')
      await waitFor(`!document.querySelector('.globe-solid-surface.is-running')`)
      assert.equal(await evaluate(`document.querySelectorAll('.globe-route-track:not(.is-connecting)').length`), 0, 'stopped core displays preview routes without live connection styling')
      await evaluate(`document.querySelector('button[aria-label="Start core"]').click()`)
      await waitFor(`document.querySelector('.sidebar-vpn-badge').dataset.state === 'on'`)
      await waitFor(`document.querySelector('.overview-session-duration')?.textContent.startsWith('00:00:')`)
      result.checks.push('Rules/Global keep the running core indicator on, including without capture; stopping turns it off')
      await navigate('Settings')
      await evaluate(`(() => { const select = document.querySelector('select[aria-label="Interface language"]'); select.value = 'ru'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
      await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
      await waitFor(`document.documentElement.lang === 'ru' && document.querySelector('h1')?.textContent === 'Настройки'`)
      result.checks.push('Settings page changes the full interface to Russian')
      const russianPages = ['Главная', 'Группы прокси', 'Профили', 'Соединения', 'Правила', 'Журнал', 'Системный прокси', 'Интерфейс TUN', 'DNS', 'Сниффер', 'Ресурсы', 'Ядро Mihomo', 'Настройки']
      for (const [width, height] of [[840, 560], [1440, 900]]) {
        win.setSize(width, height)
        await delay(100)
        for (const label of russianPages) {
          await navigate(label)
          assert.equal(await evaluate(`document.querySelector('h1')?.textContent`), label)
          assert.equal(await evaluate(`document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.app-main').scrollWidth > document.querySelector('.app-main').clientWidth + 1`), false, `${label}: Russian layout overflow`)
          result.checks.push(`${width}x${height} Russian ${label}`)
        }
        await navigate('Группы прокси')
        if (width === 840) await screenshot('proxy-groups-ru')
        await navigate('Главная')
        await screenshot(`overview-ru-${width}`)
      }
      await navigate('Настройки')
      await evaluate(`(() => { const select = document.querySelector('select[aria-label="Язык интерфейса"]'); select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
      await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
      await waitFor(`document.documentElement.lang === 'en' && document.querySelector('h1')?.textContent === 'Settings'`)
      result.checks.push('Settings page switches language back to English')
      assert.deepEqual(result.errors, [], 'Renderer errors')
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
      console.log(`PASS: ${result.checks.length} UI checks; ${result.errors.length} renderer errors`)
      win.destroy()
      app.exit(0)
    } catch (err) {
      result.errors.push(err.stack)
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
      await screenshot('failure').catch(() => {})
      console.error(err)
      win.destroy()
      app.exit(1)
    }
  }).catch((err) => { console.error(err); app.exit(1) })
}
