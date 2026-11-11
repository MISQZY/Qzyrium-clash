const { spawnSync } = require('node:child_process')
const path = require('node:path')
const electron = require('electron')

for (const script of ['subscriptions-ui', 'ui', 'rules-ui', 'display-ui', 'globe-ui', 'theme-contrast-ui', 'editors-ui', 'profile-info-ui', 'shortcuts-ui', 'startup-theme-ui', 'offline-proxies-ui', 'localization-ui', 'updater-ui', 'tray']) {
  const result = spawnSync(electron, [path.join(__dirname, `verify-${script}.cjs`)], { stdio: 'inherit', windowsHide: true })
  if (result.error) console.error(result.error)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
