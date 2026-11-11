const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const yaml = require('yaml')

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-rule-recovery-'))
const coreBinaryPath = path.resolve('extra/sidecar', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo')
function load(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const exports = {}
  vm.runInThisContext(`(function(exports, require) {\n${output}\n})`, { filename: file })(exports, (name) => {
    if (dependencies[name]) return dependencies[name]
    if (name.endsWith('/paths')) return { getAppPaths: () => ({ mihomoDir: workDir, coreBinaryPath }) }
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target, dependencies) : require(name)
  })
  return exports
}

async function main() {
  const { prepareProfileContent } = load('src/main/utils/profile-validator.ts')
  const { DEFAULT_APP_CONFIG } = load('src/shared/app-config.ts')
  const settings = structuredClone(DEFAULT_APP_CONFIG)
  settings.kernel.tun.enable = false
  const profile = 'proxies: []\nproxy-groups:\n  - name: Available\n    type: select\n    proxies: [DIRECT]\nrules:\n  - DOMAIN,base.example,DIRECT\n  - MATCH,DIRECT\n'
  const { validateRulePayload } = load('src/shared/rule-validation.ts')
  const accepted = [
    ['DOMAIN', '123.example'], ['DOMAIN', 'example.123'], ['DOMAIN', 'пример123.рф'],
    ['DOMAIN', 'xn--e1afmkfd.xn--p1ai'], ['DOMAIN', 'router'], ['DOMAIN', 'a.b'],
    ['DOMAIN', '_service.local.'], ['DOMAIN-SUFFIX', 'рф'], ['DOMAIN-SUFFIX', '.пример.рф'],
    ['DOMAIN-SUFFIX', 'example.123'], ['DOMAIN-KEYWORD', 'сервис42'],
    ['DOMAIN-REGEX', '(?i)^пример[0-9]+\\.рф$'], ['DOMAIN-REGEX', '(?i:example).*'],
    ['DOMAIN-REGEX', '\\Aexample\\z'], ['PROCESS-NAME-REGEX', '(?i).*torrent.*'],
    ['PROCESS-PATH-REGEX', '(?i).*Application\\\\chrome.*'],
    ['PROCESS-PATH', 'C:\\Программы\\Браузер 123\\browser.exe'],
    ['IP-CIDR', '0.0.0.0/0'], ['IP-CIDR', '255.255.255.255/32'],
    ['IP-CIDR', '2001:db8::/32'], ['IP-CIDR6', '::/0'], ['IP-CIDR6', '::1/128'],
    ['IP-CIDR6', '::ffff:192.0.2.1/128'], ['SRC-IP-CIDR', '2001:db8::1/64'],
    ['IP-SUFFIX', '192.168.1.2/24'], ['SRC-IP-SUFFIX', '2001:db8::1/64'],
    ['DST-PORT', '0'], ['DST-PORT', '65535'], ['SRC-PORT', '80/443/8000-9000'],
    ['IN-PORT', '100-80'], ['DST-PORT', '[80-90]/443'],
    ['DSCP', '0'], ['DSCP', '0-10/63'], ['DSCP', '*'], ['NETWORK', 'UDP'],
    ['AND', '((DOMAIN,пример.рф))'], ['OR', '((DST-PORT,80))'],
    ['NOT', '((DOMAIN,пример.рф))']
  ]
  for (const [type, payload] of [...accepted, ['UID', '0'], ['UID', '1000-2000/4294967295'], ['IP-ASN', '0'], ['SRC-IP-ASN', '4294967295']]) {
    assert.ok(validateRulePayload(type, payload), `editor accepts ${type}: ${payload}`)
  }
  const acceptedByCore = await prepareProfileContent(profile, settings, accepted.map(([type, payload], index) =>
    ({ id: `syntax-${index}`, type, payload, proxy: 'DIRECT' })))
  assert.deepEqual(acceptedByCore.rules.filter(rule => rule.validationError), [], 'valid editor cases are accepted by bundled Mihomo')
  for (const [type, payload] of [
    ['DOMAIN', 'https://example.com'], ['DOMAIN-SUFFIX', 'пример .рф'], ['DOMAIN-KEYWORD', 'one,two'],
    ['IP-CIDR', '256.1.1.1/24'], ['IP-CIDR', '01.2.3.4/24'], ['IP-CIDR', '1.2.3.4/33'],
    ['IP-CIDR6', '2001:::1/64'], ['IP-CIDR6', '1:2:3:4:5:6:7/64'], ['IP-CIDR6', '::/129'],
    ['IP-CIDR6', '::ffff:999.0.0.1/128'], ['IP-CIDR6', 'fe80::1%eth0/64'],
    ['DST-PORT', '65536'], ['SRC-PORT', '-1'], ['IN-PORT', '1.5'], ['DST-PORT', '1e3'],
    ['DSCP', '64'], ['DSCP', '-1'], ['UID', '4294967296'], ['IP-ASN', '1.5'],
    ['SRC-IP-ASN', '-1'], ['IP-ASN', '1e3'], ['NETWORK', 'icmp']
  ]) assert.equal(validateRulePayload(type, payload), false, `editor rejects ${type}: ${payload}`)
  const badRegex = await prepareProfileContent(profile, settings, [{ id: 'regex', type: 'DOMAIN-REGEX', payload: '[', proxy: 'DIRECT' }])
  assert.ok(badRegex.rules[0].validationError, 'invalid regex is still rejected by Mihomo at save time')
  const rules = [
    { id: 'missing', type: 'DOMAIN', payload: 'one.example', proxy: 'Missing' },
    { id: 'valid', type: 'DOMAIN', payload: 'two.example', proxy: 'Available' },
    { id: 'bad-cidr', type: 'IP-CIDR', payload: '999.0.0.1/64', proxy: 'DIRECT', position: 'bottom' },
    { id: 'manual', type: 'DOMAIN', payload: 'disabled.example', proxy: 'Missing', enabled: false }
  ]
  const prepared = await prepareProfileContent(profile, settings, rules)
  assert.ok(prepared.rules[0].validationError, 'missing group is quarantined')
  assert.equal(prepared.rules[1].validationError, undefined)
  assert.ok(prepared.rules[2].validationError, 'bad bottom rule is quarantined after indexes shift')
  assert.equal(prepared.rules[3].validationError, undefined)
  assert.deepEqual(yaml.parse(prepared.config).rules, ['DOMAIN,two.example,Available', 'DOMAIN,base.example,DIRECT', 'MATCH,DIRECT'])
  assert.match(prepared.config, /# - "DOMAIN,one.example,Missing"/)
  assert.match(prepared.config, /# - "IP-CIDR,999.0.0.1\/64,DIRECT"/)
  assert.equal(rules[0].validationError, undefined, 'validation does not mutate input')
  const fixed = prepared.rules.map(rule => rule.id === 'missing' ? { ...rule, proxy: 'Available' } : rule.id === 'bad-cidr' ? { ...rule, payload: '192.168.0.0/16' } : rule)
  const restored = await prepareProfileContent(profile, settings, fixed)
  assert.ok(restored.rules.every(rule => !rule.validationError), 'fixed rules are automatically retried')
  assert.ok(yaml.parse(restored.config).rules.includes('DOMAIN,one.example,Available'))
  assert.ok(yaml.parse(restored.config).rules.includes('IP-CIDR,192.168.0.0/16,DIRECT'))
  await assert.rejects(prepareProfileContent(profile.replace('DOMAIN,base.example,DIRECT', 'DOMAIN,base.example,Missing'), settings, rules), /Profile validation failed/, 'subscription errors remain fatal')
  await assert.rejects(prepareProfileContent('not: [valid', settings, rules), /Profile validation failed|YAML/)
  const blank = await prepareProfileContent(profile, settings, [{ id: 'blank', type: 'IP-CIDR', payload: '', proxy: 'DIRECT' }])
  assert.ok(blank.rules[0].validationError, 'empty payload cannot silently disappear')
  const { ProfileService } = load('src/main/services/ProfileService.ts')
  const draftValidator = Object.create(ProfileService.prototype)
  draftValidator.getProfileContent = async () => profile
  draftValidator.settingService = { getSettings: () => settings }
  const checkedDraft = await draftValidator.validateCustomRules('test', [rules[0]])
  assert.ok(checkedDraft[0].validationError, 'inline validation checks the draft against the actual core')
  assert.equal(rules[0].validationError, undefined, 'draft validation does not mutate saved rules')
  const layoutProfile = 'proxies: []\nrules:\n  - DOMAIN,a.example,DIRECT\n  - DOMAIN,b.example,DIRECT\n  - MATCH,DIRECT\n'
  const source = (value, offset, extra = {}) => ({ id: value, type: 'DOMAIN', payload: '', proxy: 'DIRECT', sourceRule: value, sourceOccurrence: 0, offset, ...extra })
  const layout = [
    source('DOMAIN,a.example,DIRECT', 2), source('DOMAIN,b.example,DIRECT', 0),
    { id: 'c', type: 'DOMAIN', payload: 'c.example', proxy: 'DIRECT', offset: 1 },
    { id: 'd', type: 'DOMAIN', payload: 'd.example', proxy: 'DIRECT', position: 'bottom', offset: 1 }
  ]
  const reordered = await prepareProfileContent(layoutProfile, settings, layout)
  assert.deepEqual(yaml.parse(reordered.config).rules, ['DOMAIN,b.example,DIRECT', 'DOMAIN,c.example,DIRECT', 'DOMAIN,a.example,DIRECT', 'DOMAIN,d.example,DIRECT', 'MATCH,DIRECT'])
  const extended = await prepareProfileContent(layoutProfile.replace('  - MATCH', '  - DOMAIN,new.example,DIRECT\n  - MATCH'), settings, layout)
  assert.ok(yaml.parse(extended.config).rules.indexOf('DOMAIN,new.example,DIRECT') < yaml.parse(extended.config).rules.indexOf('MATCH,DIRECT'), 'new subscription rules are kept before their next known rule')
  const duplicate = await prepareProfileContent(layoutProfile.replace('  - DOMAIN,b.example,DIRECT', '  - DOMAIN,a.example,DIRECT'), settings, [source('DOMAIN,a.example,DIRECT', 0, { isDeleted: true })])
  assert.equal(yaml.parse(duplicate.config).rules.filter(rule => rule === 'DOMAIN,a.example,DIRECT').length, 1, 'duplicate source rows are addressed by occurrence')
  const { MihomoConfigFactory } = load('src/main/core/MihomoConfigFactory.ts')
  const { toCustomRules, mergeRuleOverrides } = load('src/shared/rule-editor.ts')
  const { serializeRulesToYaml, parseYamlToVisualRules } = load('src/shared/rule-editor-yaml.ts')
  const originalRow = { id: 'edited-source', type: 'DOMAIN', payload: 'a.example', proxy: 'DIRECT', sourceRule: 'DOMAIN,a.example,DIRECT', sourceOccurrence: 0, sourceIndex: 0 }
  for (const isMoved of [false, true]) {
    const edited = toCustomRules([{ ...originalRow, proxy: 'REJECT', isMoved }])
    assert.equal(edited[0].replacementRule, 'DOMAIN,a.example,REJECT')
    const compiled = await prepareProfileContent(layoutProfile, settings, edited)
    assert.deepEqual(yaml.parse(compiled.config).rules, ['DOMAIN,a.example,REJECT', 'DOMAIN,b.example,DIRECT', 'MATCH,DIRECT'])
    const reopened = mergeRuleOverrides([originalRow], compiled.rules)
    assert.equal(reopened[0].proxy, 'REJECT', 'edited subscription target survives reload')
    const roundTrip = parseYamlToVisualRules(serializeRulesToYaml(reopened, key => key), [originalRow])
    assert.equal(roundTrip[0].proxy, 'REJECT', 'YAML preserves replacement target')
    assert.equal(roundTrip[0].sourceRule, originalRow.sourceRule, 'YAML preserves original source identity')
  }
  const invalidReplacement = await prepareProfileContent(layoutProfile, settings, toCustomRules([{ ...originalRow, proxy: 'Missing' }]))
  assert.ok(invalidReplacement.rules[0].validationError, 'invalid replacement is quarantined by its own id')
  assert.ok(!yaml.parse(invalidReplacement.config).rules.some(rule => rule.includes('a.example')), 'invalid replacement cannot retain the original active row')
  const permutations = values => values.length ? values.flatMap((value, index) =>
    permutations(values.filter((_, itemIndex) => itemIndex !== index)).map(tail => [value, ...tail])) : [[]]
  for (const sequence of permutations(['a', 'b', 'c', 'd'])) {
    const overrides = sequence.map((value, offset) => value === 'a' || value === 'b'
      ? source(`DOMAIN,${value}.example,DIRECT`, offset)
      : { id: value, type: 'DOMAIN', payload: `${value}.example`, proxy: 'DIRECT', offset })
    assert.deepEqual(yaml.parse(MihomoConfigFactory.synthesize(layoutProfile, settings, overrides)).rules,
      [...sequence.map(value => `DOMAIN,${value}.example,DIRECT`), 'MATCH,DIRECT'], 'mixed user and subscription permutations')
  }
  const hiddenRows = [
    source('DOMAIN,b.example,DIRECT', 0, { isDeleted: true }),
    { id: 'off', type: 'DOMAIN', payload: 'off.example', proxy: 'DIRECT', offset: 1, enabled: false },
    source('DOMAIN,a.example,DIRECT', 3),
    { id: 'c', type: 'DOMAIN', payload: 'c.example', proxy: 'DIRECT', offset: 2 }
  ]
  assert.deepEqual(yaml.parse(MihomoConfigFactory.synthesize(layoutProfile, settings, hiddenRows)).rules,
    ['DOMAIN,c.example,DIRECT', 'DOMAIN,a.example,DIRECT', 'MATCH,DIRECT'], 'hidden rows keep their positions until disabled entries are filtered')
  const warnings = []
  const { KernelService } = load('src/main/services/KernelService.ts')
  const service = Object.create(KernelService.prototype)
  let savedRules = rules
  service.settingService = { getSettings: () => settings }
  service.broadcaster = (channel, message) => warnings.push({ channel, message })
  service.profileService = {
    getCustomRules: () => savedRules,
    setRuleValidation: async (_id, value) => { savedRules = value }
  }
  await service.prepareConfig(profile, 'test')
  assert.ok(savedRules[0].validationError, 'kernel preparation persists the errors used by the editor')
  service.warnInvalidRules('test')
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].channel, 'event:warning')
  assert.equal(service.getRuleWarning(), warnings[0].message, 'startup warning remains available when the renderer mounts later')
  savedRules = restored.rules
  service.warnInvalidRules('test')
  assert.equal(warnings.length, 1, 'no warning for repaired or manually disabled rules')
  assert.deepEqual(fs.readdirSync(workDir), [], 'temporary validation files are removed')
  console.log('Rule recovery verified against bundled Mihomo: quarantine, comments, ordering, repair and fatal subscription errors')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(workDir, { recursive: true, force: true }))
