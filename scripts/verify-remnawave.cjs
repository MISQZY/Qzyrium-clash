const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')
const { parseSubscriptionMetadata } = load('src/main/utils/subscription-metadata.ts')
const { subscriptionUpdateInterval } = load('src/shared/profile.ts')

async function verify() {
  for (const invalid of ['0', '-1', 'Infinity', '1.5', '721', 'abc']) {
    assert.equal(parseSubscriptionMetadata({ 'profile-update-interval': invalid }, '').serverInterval, undefined)
  }
  assert.equal(parseSubscriptionMetadata({ 'Profile-Update-Interval': '12' }, '').serverInterval, 720)
  assert.equal(subscriptionUpdateInterval({ interval: 90, serverInterval: 720 }), 90)
  assert.equal(subscriptionUpdateInterval({ serverInterval: 720 }), 720)
  assert.equal(subscriptionUpdateInterval({}, 120), 120)
  fs.mkdirSync('artifacts', { recursive: true })
  const directory = fs.mkdtempSync(path.resolve('artifacts/remnawave-'))
  const { ProfileRepository } = load('src/main/services/ProfileRepository.ts')
  const repository = new ProfileRepository({ profilesDir: directory, profilesFilePath: path.join(directory, 'profiles.json') })
  const config = structuredClone(load('src/shared/app-config.ts').DEFAULT_APP_CONFIG)
  const { ProfileService } = load('src/main/services/ProfileService.ts', {
    '../utils/profile-validator': { validateProfileContent: async () => {} }
  })
  let headers = { 'profile-update-interval': '12' }
  const service = new ProfileService({ getSettings: () => config, updateSettings: async patch => Object.assign(config, patch) }, {
    download: async () => ({ content: 'rules: [MATCH,DIRECT]', ...parseSubscriptionMetadata(headers, '') })
  }, repository)
  await service.initialize()
  const profile = await service.addProfile({ type: 'remote', url: 'https://example.invalid/sub' })
  assert.equal(service.getActiveProfile().serverInterval, 720)
  await service.updateProfileInfo(profile.id, { interval: 90 })
  headers = { 'profile-update-interval': '6' }
  await service.updateProfile(profile.id)
  assert.equal(subscriptionUpdateInterval(service.getActiveProfile()), 90, 'server cannot replace a manual schedule')
  await service.updateProfileInfo(profile.id, { interval: null })
  assert.equal(subscriptionUpdateInterval(service.getActiveProfile()), 360)
  headers = {}
  await service.updateProfile(profile.id)
  assert.equal(subscriptionUpdateInterval(service.getActiveProfile()), 60, 'removed header restores the application fallback')
  await service.updateProfileInfo(profile.id, { sendHwid: true })
  assert.equal(service.getActiveProfile().sendHwid, true)
  const working = await service.getProfileContent(profile.id)
  headers = { 'X-Hwid-Max-Devices-Reached': 'true', 'support-url': 'https://support.example/help' }
  await assert.rejects(service.updateProfile(profile.id), { code: 'device-limit' })
  assert.equal(await service.getProfileContent(profile.id), working, 'limit placeholders never replace a working profile')
  assert.equal(service.getActiveProfile().deviceStatus, 'limit')
  assert.equal(service.getActiveProfile().supportUrl, 'https://support.example/help')
  const count = service.getProfiles().length
  await assert.rejects(service.addProfile({ type: 'remote', url: 'https://example.invalid/denied' }), { code: 'device-limit' })
  assert.equal(service.getProfiles().length, count, 'denied imports do not create broken profiles')
  headers = { 'x-hwid-not-supported': 'true' }
  await assert.rejects(service.updateProfile(profile.id), { code: 'hwid-required' })
  headers = {}
  await service.updateProfile(profile.id)
  assert.equal(service.getActiveProfile().deviceStatus, undefined)
  await service.dispose()

  const { subscriptionDeviceHeaders } = load('src/main/utils/subscription-device.ts', { './paths': { getAppPaths: () => ({ userData: directory }) } })
  const identity = await subscriptionDeviceHeaders('https://provider.example/sub')
  assert.match(identity['x-hwid'], /^[a-zA-Z0-9=-]{10,64}$/)
  assert.equal((await subscriptionDeviceHeaders('https://provider.example/other'))['x-hwid'], identity['x-hwid'])
  assert.notEqual((await subscriptionDeviceHeaders('https://other.example'))['x-hwid'], identity['x-hwid'])
  let identities = 0, requests = []
  const { SubscriptionClient } = load('src/main/core/SubscriptionClient.ts', { axios: {
    get: async (_url, options) => { requests.push(options); return requests.length === 1
      ? { status: 302, headers: { location: 'https://other.example/sub' } }
      : { status: 200, headers: {}, data: 'rules: []' } }
  } })
  const client = new SubscriptionClient(() => config, () => true, {
    resolve: async () => [{ address: '203.0.113.1', family: 4 }], deviceHeaders: async () => { identities++; return identity }
  })
  await client.download('https://provider.example/sub')
  assert.equal(identities, 0, 'ordinary subscriptions do not need a device identity')
  assert.equal(requests[0].headers['x-hwid'], undefined)
  requests = []
  await client.download('https://provider.example/sub', undefined, false, true)
  assert.equal(requests[0].headers['x-hwid'], identity['x-hwid'])
  assert.equal(requests[1].headers['x-hwid'], undefined, 'cross-origin redirects do not receive the opted-in identifier')
  const { SubscriptionClient: DeniedClient } = load('src/main/core/SubscriptionClient.ts', { axios: {
    get: async () => ({ status: 403, headers: { 'x-hwid-limit': 'true' }, data: 'private placeholder' })
  } })
  const denied = await new DeniedClient(() => config, () => true, { resolve: async () => [{ address: '203.0.113.1', family: 4 }] }).download('https://provider.example/sub')
  assert.equal(denied.deviceStatus, 'limit'); assert.equal(denied.content, '')

  let mode = 'required', automaticRequests = []
  const { SubscriptionClient: AutomaticClient } = load('src/main/core/SubscriptionClient.ts', { axios: {
    get: async (url, options) => {
      automaticRequests.push({ url, options })
      if (mode === 'redirect' && new URL(url).hostname === 'provider.example') {
        return { status: 302, headers: { location: 'https://other.example/sub' } }
      }
      return mode !== 'required' || !options.headers['x-hwid']
        ? { status: 403, headers: { 'x-hwid-not-supported': 'true' }, data: 'placeholder' }
        : { status: 200, headers: {}, data: 'rules: []' }
    }
  } })
  const automaticClient = new AutomaticClient(() => config, () => true, {
    resolve: async () => [{ address: '203.0.113.1', family: 4 }],
    deviceHeaders: async origin => { assert.equal(origin, 'https://provider.example'); return identity }
  })
  const automaticService = new ProfileService({ getSettings: () => config }, automaticClient, repository)
  await automaticService.initialize()
  const automatic = await automaticService.addProfile({ type: 'remote', url: 'https://provider.example/sub' })
  assert.equal(automatic.sendHwid, true, 'automatic device enrollment persists on import')
  assert.equal(automaticRequests.length, 2)
  assert.equal(automaticRequests[0].options.headers['x-hwid'], undefined)
  assert.equal(automaticRequests[1].options.headers['x-hwid'], identity['x-hwid'])
  assert.equal(automaticRequests[0].options.signal, automaticRequests[1].options.signal, 'retry shares the request deadline')
  await automaticService.updateProfileInfo(automatic.id, { sendHwid: false })
  automaticRequests = []
  await automaticService.updateProfile(automatic.id)
  assert.equal(automaticRequests.length, 2)
  assert.equal(automaticService.getProfiles().find(item => item.id === automatic.id).sendHwid, true, 'automatic enrollment persists on update')
  automaticRequests = []
  await automaticService.updateProfile(automatic.id)
  assert.equal(automaticRequests.length, 1, 'later updates send the saved device identity immediately')
  mode = 'persistent'
  automaticRequests = []
  const stillRequired = await automaticClient.download('https://provider.example/sub')
  assert.equal(stillRequired.deviceStatus, 'required')
  assert.equal(stillRequired.content, '')
  assert.equal(automaticRequests.length, 2, 'persistent requirement cannot cause an unbounded retry')
  mode = 'redirect'
  automaticRequests = []
  const redirectedRequirement = await automaticClient.download('https://provider.example/sub')
  assert.equal(redirectedRequirement.deviceStatus, 'required')
  assert.equal(redirectedRequirement.sendHwid, false)
  assert.equal(automaticRequests.length, 2)
  assert.ok(automaticRequests.every(request => !request.options.headers['x-hwid']), 'a different origin cannot trigger automatic identity disclosure')
  await automaticService.dispose()
  const { subscriptionUsage, subscriptionHealth } = load('src/shared/subscription-health.ts')
  assert.equal(subscriptionUsage({ total: 100, upload: 5, download: 20 }).percent, 25)
  assert.equal(subscriptionUsage({ total: 100, download: 90 }).status, 'near')
  assert.equal(subscriptionUsage({ total: 100, download: 150 }).percent, 100)
  assert.equal(subscriptionUsage({ total: 100, download: 150 }).remaining, 0)
  assert.equal(subscriptionUsage({ total: 100, upload: 5, download: 20 }, 15).percent, 40)
  assert.equal(subscriptionUsage({ total: 100, upload: 5, download: 20 }, 15).used, 40)
  assert.equal(subscriptionUsage({ total: 100, upload: 5, download: 20 }, 15).remaining, 60)
  assert.equal(subscriptionUsage({ total: 100, upload: 5, download: 20 }, 15).runtimeDelta, 15)
  assert.equal(subscriptionUsage({ total: 100, download: 80 }, 15).status, 'near')
  for (const info of [{ total: 0, download: 50 }, { total: 100 }, { total: Infinity, download: 50 }, { total: -1, download: 50 }]) assert.equal(subscriptionUsage(info), null)
  assert.equal(parseSubscriptionMetadata({ 'subscription-userinfo': 'total=Infinity; download=-1; upload=NaN' }, '').userInfo, undefined)
  assert.equal(parseSubscriptionMetadata({ 'display-mode': 'simple' }, '').displayMode, 'single')
  assert.equal(parseSubscriptionMetadata({ 'Display-Mode': 'full' }, '').displayMode, 'full')
  assert.equal(parseSubscriptionMetadata({ 'profile-display-mode': 'simple' }, '').displayMode, 'single')
  assert.equal(parseSubscriptionMetadata({ 'display-mode': 'invalid' }, '').displayMode, undefined)
  assert.equal(parseSubscriptionMetadata({}, '').displayMode, undefined)
  const now = Date.now()
  assert.equal(subscriptionHealth({ expire: now / 1000 - 1 }, now).expiry, 'expired')
  assert.equal(subscriptionHealth({ expire: now / 1000 + 86400 }, now).expiry, 'soon')
  assert.equal(subscriptionHealth({ expire: now - 1000 }, now).expiry, 'expired')
  assert.equal(subscriptionHealth({ expire: now + 86400000 }, now).expiry, 'soon')
  assert.equal(subscriptionHealth({ expire: 0 }, now).expiry, undefined)
  const notices = []
  const { SubscriptionNotifications } = load('src/main/services/SubscriptionNotifications.ts', { electron: {} })
  const notifications = new SubscriptionNotifications(() => {}, (_title, body) => notices.push(body), () => true)
  const limited = { ...profile, userInfo: { total: 100, download: 90, expire: now / 1000 + 86400 } }
  notifications.check([limited], config.general, now)
  notifications.check([limited], config.general, now)
  assert.equal(notices.length, 1, 'unchanged warnings notify once per session')
  limited.userInfo.download = 150
  notifications.check([limited], config.general, now)
  assert.equal(notices.length, 2, 'exhaustion has its own notification')
  notifications.check([{ ...limited, userInfo: { total: 100, download: 1 } }], config.general, now)
  notifications.check([limited], { ...config.general, subscriptionNotifications: false }, now)
  assert.equal(notices.length, 2, 'notification preference is respected')
  notifications.check([limited], config.general, now)
  assert.equal(notices.length, 3, 'a recovered subscription can warn again in a new allowance period')
  console.log('PASS: server intervals, automatic HWID enrollment and persistence, bounded retries, redirect privacy, device limits and preservation of working profiles')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
