const { spawnSync } = require('node:child_process')
const path = require('node:path')

for (const script of ['ipc', 'subscriptions', 'updates', 'startup', 'elevation', 'i18n', 'kernel-lifecycle', 'profile-loading', 'data-loading', 'offline-proxies', 'settings', 'themes', 'globe', 'globe-layout', 'recovery', 'traffic', 'diff-editor', 'rule-recovery', 'logs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, `verify-${script}.cjs`)], { stdio: 'inherit', windowsHide: true })
  if (result.error) console.error(result.error)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
