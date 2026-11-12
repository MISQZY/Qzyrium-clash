const path = require('node:path')

const functional = ['test-runner', 'ipc', 'subscriptions', 'updates', 'startup', 'elevation', 'i18n',
  'kernel-lifecycle', 'profile-loading', 'profile-import', 'data-loading', 'connections', 'offline-proxies', 'settings', 'themes',
  'globe', 'globe-layout', 'recovery', 'system-proxy', 'traffic', 'diff-editor', 'rule-recovery', 'logs', 'window-behavior', 'backup', 'diagnostics']
const ui = ['ipc-ui', 'subscriptions-ui', 'ui', 'rules-ui', 'display-ui', 'globe-ui', 'theme-contrast-ui',
  'editors-ui', 'profile-info-ui', 'shortcuts-ui', 'startup-theme-ui', 'offline-proxies-ui', 'proxy-order-ui',
  'localization-ui', 'updater-ui', 'tray', 'rule-recovery-ui', 'admin-ui', 'workspace-ui', 'globe-glow-ui', 'onboarding-ui', 'process-model', 'native-window-ui']

const check = (id, suite, runtime, args = []) => Object.freeze({
  id, suite, runtime, file: path.join(__dirname, `verify-${id}.cjs`), args: Object.freeze(args),
  timeoutMs: runtime === 'electron' ? 300_000 : 90_000
})
const checks = Object.freeze([
  ...functional.map(id => check(id, 'functional', 'node')),
  ...ui.map(id => check(id, 'ui', 'electron')),
  Object.freeze({ ...check('process-model', 'ui', 'electron', ['--low-memory']), id: 'process-model-low-memory' }),
  ...[[], ['--silent']].map(args => Object.freeze({
    id: args.length ? 'packaged-silent' : 'packaged-normal', suite: 'packaged-ui', runtime: 'node',
    file: path.join(__dirname, 'check-packaged-ui.cjs'), args: Object.freeze(args), timeoutMs: 180_000
  })),
  Object.freeze({ id: 'resize-stress', suite: 'resize-ui', runtime: 'node',
    file: path.join(__dirname, 'check-packaged-ui.cjs'), args: Object.freeze(['--resize-stress', '--stress-ms=120000']), timeoutMs: 300_000 }),
  check('bundle', 'build', 'node'),
  ...['version', 'resources', 'assets'].map(stage => Object.freeze({
    ...check('release', 'release', 'node', [stage]), id: `release-${stage}`
  }))
])

function getChecks(suite) {
  const selected = checks.filter(check => check.suite === suite)
  if (!selected.length) throw new Error(`Unknown test suite: ${suite}`)
  return selected
}

module.exports = { checks, getChecks }
