const fs = require('node:fs')
const { spawn, execFileSync } = require('node:child_process')

const runIp = args => execFileSync('ip', args, { encoding: 'utf8', timeout: 5000 })

function descriptor(tun) {
  if (!tun?.enable || tun['auto-route'] === false) return null
  const result = { device: tun.device, table: tun['iproute2-table-index'] ?? 2022, priority: tun['iproute2-rule-index'] ?? 9000 }
  if (typeof result.device !== 'string' || !/^[a-zA-Z0-9_.-]{1,15}$/.test(result.device) ||
    !Number.isInteger(result.table) || result.table < 1 || result.table > 4294967295 || [253, 254, 255].includes(result.table) ||
    !Number.isInteger(result.priority) || result.priority < 1 || result.priority > 32755) {
    throw new Error('Invalid Linux TUN recovery configuration')
  }
  return result
}

function rules(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const match = /^(\d+):\s*(.+)$/.exec(line.trim())
    if (!match) throw new Error('Cannot parse Linux policy routing rules')
    return { priority: Number(match[1]), text: match[2].trim().replace(/\s+/g, ' ') }
  })
}

const scoped = (rule, tun) => rule.priority >= tun.priority && rule.priority <= tun.priority + 10

function owned(rule, tun) {
  const cidr = '[0-9a-fA-F:.]+/\\d+'
  const device = tun.device.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  switch (rule.priority - tun.priority) {
    case 0: return new RegExp(`^from all to ${cidr} lookup ${tun.table}$`).test(rule.text) ||
      /^from all lookup (?:unspec|0) unreachable$/.test(rule.text)
    case 1: return rule.text === 'from all lookup main suppress_prefixlength 0' ||
      new RegExp(`^from all iif ${device} lookup (?:unspec|0) local$`).test(rule.text)
    case 2: return new RegExp(`^from (?:all|0\\.0\\.0\\.0|::|${cidr}) iif lo lookup ${tun.table}$`).test(rule.text)
    case 10: return /^(?:from all )?lookup (?:unspec|0) broadcast$/.test(rule.text)
    default: return false
  }
}

function prepareRouting(tun, ip = runIp) {
  if (!tun) return
  for (const family of ['-4', '-6']) {
    const existing = rules(ip([family, 'rule', 'show']))
    if (existing.some(rule => scoped(rule, tun) || new RegExp(`\\blookup ${tun.table}(?: |$)`).test(rule.text)) ||
      new RegExp(`\\btable ${tun.table}(?: |$)`).test(ip([family, 'route', 'show', 'table', 'all']))) {
      throw new Error('Linux TUN routing table or policy priorities are already in use')
    }
  }
}

function restoreRouting(tun, ip = runIp, exists = device => fs.existsSync(`/sys/class/net/${device}`)) {
  if (!tun) return
  if (exists(tun.device)) throw new Error('TUN interface is still active; refusing policy cleanup')
  // Reserve an empty range before spawn, then accept only Mihomo's known rule
  // shapes. Never flush a table or delete an unknown rule sharing our priority.
  for (const family of ['-4', '-6']) {
    const foreign = rules(ip([family, 'rule', 'show'])).find(rule => scoped(rule, tun) && !owned(rule, tun))
    if (foreign) {
      throw new Error(`Foreign ${family} policy rule retained (${foreign.priority}: ${foreign.text})`)
    }
  }
  for (const family of ['-4', '-6']) {
    for (let priority = tun.priority; priority <= tun.priority + 10; priority++) {
      for (let attempt = 0; ; attempt++) {
        const group = rules(ip([family, 'rule', 'show'])).filter(rule => rule.priority === priority)
        if (!group.length) break
        if (attempt >= 32 || group.some(rule => !owned(rule, tun))) throw new Error('Policy rules changed during Linux TUN cleanup')
        ip([family, 'rule', 'del', 'priority', String(priority)])
      }
    }
  }
}

function supervise(binary, tun, args) {
  prepareRouting(tun)
  const core = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  core.stdout.pipe(process.stdout, { end: false })
  core.stderr.pipe(process.stderr, { end: false })
  let timer, finished = false, requestedStop = false
  const stop = () => {
    if (finished || requestedStop) return
    requestedStop = true
    core.kill('SIGTERM')
    timer = setTimeout(() => core.kill('SIGKILL'), 4000)
  }
  process.stdin.on('end', stop)
  process.stdin.on('error', stop)
  // An Electron crash closes all three pipes. Broken log pipes must not crash
  // this supervisor before it has stopped Mihomo and restored policy rules.
  process.stdout.on('error', stop)
  process.stderr.on('error', stop)
  process.stdin.resume()
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  core.on('error', error => console.error(`Unable to spawn Mihomo: ${error.message}`))
  core.on('close', (code, signal) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    try {
      restoreRouting(tun)
      console.error(`Mihomo supervision finished (${signal ?? code}); Linux TUN policy rules restored`)
      process.exit(requestedStop ? 0 : code ?? 1)
    } catch (error) {
      console.error(`Linux TUN recovery failed: ${error.message}`)
      process.exit(1)
    }
  })
}

module.exports = { descriptor, rules, owned, prepareRouting, restoreRouting }

if (require.main === module) {
  try {
    const [binary, tun, ...args] = process.argv.slice(2)
    if (!binary || !tun || !args.length) throw new Error('Missing Mihomo supervisor arguments')
    supervise(binary, descriptor(JSON.parse(tun)), args)
  } catch (error) {
    console.error(`Linux Mihomo supervisor failed: ${error.message}`)
    process.exit(1)
  }
}
