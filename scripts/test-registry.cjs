const path = require('node:path')

const functional = ['test-runner', 'ipc', 'subscriptions', 'updates', 'startup', 'elevation', 'i18n',
  'kernel-lifecycle', 'profile-loading', 'data-loading', 'offline-proxies', 'settings', 'themes',
  'globe', 'globe-layout', 'recovery', 'traffic', 'diff-editor', 'rule-recovery', 'logs', 'window-behavior']
const ui = ['ipc-ui', 'subscriptions-ui', 'ui', 'rules-ui', 'display-ui', 'globe-ui', 'theme-contrast-ui',
  'editors-ui', 'profile-info-ui', 'shortcuts-ui', 'startup-theme-ui', 'offline-proxies-ui', 'proxy-order-ui',
  'localization-ui', 'updater-ui', 'tray', 'rule-recovery-ui', 'admin-ui', 'workspace-ui', 'globe-glow-ui']

const check = (id, suite, runtime, args = []) => Object.freeze({
  id, suite, runtime, file: path.join(__dirname, `verify-${id}.cjs`), args: Object.freeze(args),
  timeoutMs: runtime === 'electron' ? 300_000 : 90_000
})
const checks = Object.freeze([
  ...functional.map(id => check(id, 'functional', 'node')),
  ...ui.map(id => check(id, 'ui', 'electron')),
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
