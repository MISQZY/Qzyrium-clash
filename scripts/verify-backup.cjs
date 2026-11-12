const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')
const { DEFAULT_APP_CONFIG } = load('src/shared/app-config.ts')
const { parseBackup, stageBackupRestore, applyPendingBackup } = load('src/main/utils/backup.ts')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-backup-'))
const fresh = () => ({ format: 'qzyrium-backup', version: 1, createdAt: new Date().toISOString(),
  settings: structuredClone(DEFAULT_APP_CONFIG), profiles: [{ profile: { id: 'sample', name: 'Sample', type: 'local', updatedAt: 1 }, content: 'proxies: []\nrules: []\n' }], themes: [] })

;(async () => {
  const backup = fresh()
  backup.settings.activeProfileId = 'sample'
  assert.equal(parseBackup(JSON.stringify(backup)).profiles[0].content, backup.profiles[0].content)
  const emptyProfile = fresh()
  emptyProfile.profiles[0].content = ''
  assert.equal(parseBackup(JSON.stringify(emptyProfile)).profiles[0].content, '', 'empty local profiles remain portable')
  for (const mutate of [
    value => { value.version = 2 },
    value => { value.profiles[0].profile.id = '../settings' },
    value => { value.profiles.push(structuredClone(value.profiles[0])) },
    value => { value.profiles.push({ ...structuredClone(value.profiles[0]), profile: { ...value.profiles[0].profile, id: 'SAMPLE' } }) },
    value => { value.profiles[0].profile.customRules = [{ id: 'bad' }] },
    value => { value.settings.kernel.mixedPort = -1 },
    value => { value.settings.activeProfileId = 'missing' },
    value => { value.profiles[0].content = 'invalid: [' },
    value => { value.profiles[0].profile.id = 'CON' }
  ]) { const invalid = fresh(); mutate(invalid); assert.throws(() => parseBackup(JSON.stringify(invalid))) }
  fs.mkdirSync(path.join(directory, 'profiles'))
  fs.writeFileSync(path.join(directory, 'settings.json'), 'previous settings')
  fs.writeFileSync(path.join(directory, 'profiles', 'previous.yaml'), 'previous profile')
  fs.writeFileSync(path.join(directory, 'profiles', 'keep.txt'), 'unrelated')
  await stageBackupRestore(directory, backup)
  assert.equal(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'), 'previous settings', 'staging leaves running app files untouched')
  assert.equal(await applyPendingBackup(directory), true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'))).activeProfileId, 'sample')
  assert.equal(fs.readFileSync(path.join(directory, 'profiles', 'sample.yaml'), 'utf8'), backup.profiles[0].content)
  assert.ok(!fs.existsSync(path.join(directory, 'profiles', 'previous.yaml')), 'restore replaces the managed profile set')
  assert.equal(fs.readFileSync(path.join(directory, 'profiles', 'keep.txt'), 'utf8'), 'unrelated')
  assert.equal(await applyPendingBackup(directory), false, 'restore is consumed once')

  // Inject a mid-transaction failure and verify all existing content survives.
  const previous = fs.readFileSync(path.join(directory, 'settings.json'), 'utf8')
  await stageBackupRestore(directory, fresh())
  let failed = false
  const atomic = load('src/main/utils/atomicWrite.ts')
  const broken = load('src/main/utils/backup.ts', { './atomicWrite': {
    writeFileAtomicAsync: async (file, content, ...args) => {
      if (!failed && file === path.join(directory, 'profiles.json')) { failed = true; throw new Error('disk unavailable') }
      return atomic.writeFileAtomicAsync(file, content, ...args)
    }
  } })
  await assert.rejects(broken.applyPendingBackup(directory), /disk unavailable/)
  assert.equal(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'), previous, 'failed import restores previous settings')
  assert.ok(fs.existsSync(path.join(directory, 'restore-failed.json')))

  // Simulate process interruption before and after the transaction commit point.
  fs.writeFileSync(path.join(directory, 'settings.json'), 'partial write')
  fs.writeFileSync(path.join(directory, 'restore-journal.json'), JSON.stringify({ committed: false, files: [{ name: 'settings.json', content: previous }] }))
  await applyPendingBackup(directory)
  assert.equal(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'), previous)
  await stageBackupRestore(directory, backup)
  fs.writeFileSync(path.join(directory, 'restore-journal.json'), JSON.stringify({ committed: true, files: [{ name: 'settings.json', content: 'obsolete' }] }))
  assert.equal(await applyPendingBackup(directory), false)
  assert.equal(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'), previous, 'committed restore is not rolled back')
  fs.writeFileSync(path.join(directory, 'restore-journal.json'), JSON.stringify({ committed: false, files: [{ name: '../outside', content: 'bad' }] }))
  await assert.rejects(applyPendingBackup(directory), /Unsafe restore path/)
  console.log('PASS: backup validation, portable profiles, deferred restore, rollback, interrupted transactions and safe paths')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  const resolved = fs.realpathSync(directory)
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith('qzyrium-backup-'))
  fs.rmSync(resolved, { recursive: true, force: true })
})
