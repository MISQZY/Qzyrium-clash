const assert = require('node:assert/strict')
const { descriptor, rules, prepareRouting, restoreRouting } = require('../resources/linux-core-supervisor.cjs')

const tun = descriptor({ enable: true, device: 'qzyrium-test' })
const baseline = ['0: from all lookup local', '12000: from all lookup main', '32766: from all lookup main', '32767: from all lookup default']
const added = [
  '9000: from all to 198.18.0.0/30 lookup 2022',
  '9001: from all lookup main suppress_prefixlength 0',
  '9001: from all iif qzyrium-test lookup unspec local',
  '9002: from all iif lo lookup 2022',
  '9002: from 0.0.0.0 iif lo lookup 2022',
  '9002: from 198.18.0.0/30 iif lo lookup 2022',
  '9010: from all lookup unspec broadcast'
]

function fixture(ipv4 = [], ipv6 = []) {
  const state = { '-4': [...baseline, ...ipv4], '-6': [...baseline, ...ipv6] }
  const deleted = []
  const ip = args => {
    const [family, command, action] = args
    assert.ok(['-4', '-6'].includes(family))
    if (command === 'route') return ''
    if (action === 'show') return state[family].join('\n')
    assert.deepEqual(args.slice(1, 4), ['rule', 'del', 'priority'])
    const priority = Number(args[4])
    const index = state[family].findIndex(line => rules(line)[0].priority === priority)
    assert.ok(index >= 0)
    deleted.push(state[family].splice(index, 1)[0])
    return ''
  }
  return { state, deleted, ip }
}

assert.equal(descriptor(null), null)
assert.equal(descriptor({ enable: true, 'auto-route': false }), null)
for (const invalid of [
  { device: '../other' }, { device: '' }, { 'iproute2-table-index': 0 },
  { 'iproute2-table-index': 254 }, { 'iproute2-rule-index': 32766 }, { 'iproute2-rule-index': '9000' }
]) assert.throws(() => descriptor({ enable: true, device: 'qzyrium-test', ...invalid }), /Invalid/)

const clean = fixture()
prepareRouting(tun, clean.ip)
assert.equal(clean.deleted.length, 0)
for (const collision of ['9001: from all lookup main', '13000: from all lookup 2022']) {
  const existing = fixture([collision])
  assert.throws(() => prepareRouting(tun, existing.ip), /already in use/)
  assert.equal(existing.deleted.length, 0)
}
assert.throws(() => prepareRouting(tun, args => args[1] === 'route' ? 'default dev other table 2022' : baseline.join('\n')), /already in use/)

const dead = fixture(added, ['9000: from all lookup unspec unreachable'])
restoreRouting(tun, dead.ip, () => false)
assert.deepEqual(dead.state['-4'], baseline)
assert.deepEqual(dead.state['-6'], baseline)
assert.equal(dead.deleted.length, 8)

const live = fixture(added)
assert.throws(() => restoreRouting(tun, live.ip, () => true), /still active/)
assert.equal(live.deleted.length, 0)
const foreign = fixture([...added, '9001: from 10.0.0.0/8 lookup 100'])
assert.throws(() => restoreRouting(tun, foreign.ip, () => false), /Foreign/)
assert.equal(foreign.deleted.length, 0, 'an unknown rule sharing our priority prevents all deletion')

const custom = descriptor({ enable: true, device: 'qzyrium-test', 'iproute2-table-index': 2222, 'iproute2-rule-index': 9100 })
const alternate = fixture(added.map(line => line.replace(/^90/, '91').replace(/2022/g, '2222')))
restoreRouting(custom, alternate.ip, () => false)
assert.deepEqual(alternate.state['-4'], baseline)

const changing = fixture(added)
let reads = 0
assert.throws(() => restoreRouting(tun, args => {
  if (args[1] === 'rule' && args[2] === 'show' && ++reads === 3) changing.state['-4'].push('9000: from all lookup 100')
  return changing.ip(args)
}, () => false), /changed during/)
assert.equal(changing.deleted.length, 0)
console.log('PASS: Linux TUN rule ownership, IPv4/IPv6 cleanup, custom indexes, collision refusal and preservation of unrelated policies')
