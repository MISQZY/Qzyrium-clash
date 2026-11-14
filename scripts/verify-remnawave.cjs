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
  await service.dispose()
  console.log('PASS: subscription interval parsing, persistence, manual priority and automatic fallback')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
