import { useState, useEffect, useMemo } from 'react'
import { ShieldPlus, LoaderCircle } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import type { CustomRuleItem } from '@shared/profile'
import { createRuleId } from '@shared/rule-editor'
import { validateRulePayload } from '@shared/rule-validation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { NativeSelect } from '../ui/native-select'
import { ProcessIcon } from '../ProcessIcon'
import { useTranslations } from '../../i18n'
import { useProfiles, useProxies } from '../../stores/useAppStore'
import { getProcessDisplayName, getSubDomains, isIPv6 } from '../../lib/connections'
import type { ProcessGroup } from '../../lib/connections'

export interface QuickRuleDialogProps {
  connection?: ConnectionItem | null
  processGroup?: ProcessGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

interface RuleOption {
  type: string
  payload: string
}

export function QuickRuleDialog({ connection, processGroup, open, onOpenChange, onCreated }: QuickRuleDialogProps) {
  const t = useTranslations('connections')
  const common = useTranslations('common')
  const { activeProfile } = useProfiles()
  const { proxies } = useProxies()
  const [selectedType, setSelectedType] = useState('DOMAIN-SUFFIX')
  const [payload, setPayload] = useState('')
  const [selectedAction, setSelectedAction] = useState('DIRECT')
  const [position, setPosition] = useState<'top' | 'bottom'>('top')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableGroups = useMemo(() => Object.entries(proxies)
    .filter(([, node]) => 'all' in node)
    .map(([name]) => name)
    .filter((name) => !['DIRECT', 'REJECT', 'GLOBAL'].includes(name)), [proxies])

  const candidateOptions = useMemo<RuleOption[]>(() => {
    if (processGroup) {
      const options: RuleOption[] = []
      if (processGroup.path || processGroup.connections.some((item) => item.metadata.process)) {
        options.push({ type: 'PROCESS-NAME', payload: processGroup.name })
      }
      if (processGroup.path) options.push({ type: 'PROCESS-PATH', payload: processGroup.path })
      return options
    }
    if (!connection) return []
    const options: RuleOption[] = []
    const metadata = connection.metadata
    const host = metadata.host || metadata.sniffHost
    const process = getProcessDisplayName(metadata.processPath, metadata.process, '')
    if (host) {
      options.push({ type: 'DOMAIN-SUFFIX', payload: getSubDomains(host)[0] || host })
      options.push({ type: 'DOMAIN', payload: host })
    }
    if (process) options.push({ type: 'PROCESS-NAME', payload: process })
    if (metadata.processPath) options.push({ type: 'PROCESS-PATH', payload: metadata.processPath })
    if (metadata.destinationIP) {
      options.push({ type: isIPv6(metadata.destinationIP) ? 'IP-CIDR6' : 'IP-CIDR',
        payload: `${metadata.destinationIP}${isIPv6(metadata.destinationIP) ? '/128' : '/32'}` })
    }
    return options
  }, [connection, processGroup])

  useEffect(() => {
    if (!open) return
    setSelectedType(candidateOptions[0]?.type || 'DOMAIN-SUFFIX')
    setPayload(candidateOptions[0]?.payload || '')
    setSelectedAction('DIRECT')
    setPosition('top')
    setError(null)
  }, [open, candidateOptions])

  const valid = !!payload.trim() && !/[,\r\n]/.test(payload) && validateRulePayload(selectedType, payload)
  const handleSave = async () => {
    if (!window.api || !activeProfile || !valid || saving) return
    setSaving(true)
    setError(null)
    try {
      const existing = await window.api.profiles.getCustomRules(activeProfile.id)
      const newRule: CustomRuleItem = {
        id: createRuleId(), type: selectedType, payload: payload.trim(), proxy: selectedAction, position, offset: 0
      }
      const updatedExisting = existing.map((rule) => {
        if (position === 'bottom') {
          return rule.position === 'bottom' && typeof rule.offset === 'number'
            ? { ...rule, offset: rule.offset + 1 }
            : rule
        }
        return rule.position !== 'bottom' && typeof rule.offset === 'number'
          ? { ...rule, offset: rule.offset + 1 }
          : rule
      })
      await window.api.profiles.saveCustomRules(activeProfile.id,
        position === 'bottom' ? [...updatedExisting, newRule] : [newRule, ...updatedExisting])
      onCreated?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!connection && !processGroup) return null
  const processPath = processGroup?.path || connection?.metadata.processPath
  const processName = processGroup?.name || getProcessDisplayName(processPath, connection?.metadata.process, '')
  const optionLabel = (type: string) => {
    if (type === 'DOMAIN-SUFFIX') return t('domainSuffixMatch')
    if (type === 'DOMAIN') return t('exactDomainMatch')
    if (type === 'PROCESS-NAME') return t('processName')
    if (type === 'PROCESS-PATH') return t('processPathMatch')
    return t('destinationIP')
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value) }}>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl flex flex-col max-h-[85dvh] overflow-hidden">
        <DialogHeader className="p-4 pr-12 border-b border-border/60 shrink-0 text-left">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {processName ? <ProcessIcon processPath={processPath} processName={processName} className="size-5" /> : <ShieldPlus className="size-5" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base leading-snug [overflow-wrap:anywhere]">{t('quickRule')}</DialogTitle>
              {processName && <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{processName}</p>}
            </div>
          </div>
          <DialogDescription className="sr-only">{t('quickRuleDescription')}</DialogDescription>
        </DialogHeader>

        <div inert={saving} aria-busy={saving} className="p-4 space-y-4 overflow-y-auto min-h-0 min-w-0 [overflow-wrap:anywhere]">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('ruleType')}</span>
            <NativeSelect aria-label={t('ruleType')} className="w-full text-xs" value={selectedType}
              onChange={(event) => {
                const option = candidateOptions.find((item) => item.type === event.target.value)
                if (option) { setSelectedType(option.type); setPayload(option.payload) }
              }}>
              {candidateOptions.map((option) => <option key={option.type} value={option.type}>{optionLabel(option.type)}</option>)}
            </NativeSelect>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('rulePayload')}</span>
            <Textarea aria-label={t('rulePayload')} value={payload} onChange={(event) => setPayload(event.target.value)}
              rows={3} className="min-h-20 resize-y text-xs whitespace-pre-wrap [overflow-wrap:anywhere]" />
          </label>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <label className="block min-w-0 space-y-1.5">
              <span className="text-xs text-muted-foreground">{t('ruleAction')}</span>
              <NativeSelect aria-label={t('ruleAction')} value={selectedAction} onChange={(event) => setSelectedAction(event.target.value)} className="w-full text-xs">
                <option value="DIRECT">{t('directDescription')}</option>
                {availableGroups.map((name) => <option key={name} value={name}>{name}</option>)}
                <option value="GLOBAL">{'GLOBAL'}</option>
                <option value="REJECT">{t('rejectDescription')}</option>
              </NativeSelect>
            </label>
            <label className="block min-w-0 space-y-1.5">
              <span className="text-xs text-muted-foreground">{t('position')}</span>
              <NativeSelect aria-label={t('position')} value={position} onChange={(event) => setPosition(event.target.value as 'top' | 'bottom')} className="w-full text-xs">
                <option value="top">{t('positionTop')}</option>
                <option value="bottom">{t('positionBottom')}</option>
              </NativeSelect>
            </label>
          </div>
          {!activeProfile && <p role="alert" className="text-xs text-destructive">{t('noActiveProfile')}</p>}
          {error && <p role="alert" className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">{error}</p>}
        </div>

        <DialogFooter className="p-4 bg-muted/20 flex-row justify-between sm:justify-between shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>{common('close')}</Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !activeProfile || !valid} className="gap-1.5">
            {saving && <LoaderCircle className="size-3.5 animate-spin" />}{t('createRule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
