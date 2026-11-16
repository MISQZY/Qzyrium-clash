import { useState, useEffect, useMemo } from 'react'
import { ShieldPlus, Check, LoaderCircle, Globe, AppWindow, Network } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import type { CustomRuleItem } from '@shared/profile'
import { createRuleId } from '@shared/rule-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { useTranslations } from '../../i18n'
import { useProfiles, useProxies } from '../../stores/useAppStore'
import { getProcessDisplayName, getSubDomains, isIPv6 } from '../../lib/connections'

export interface QuickRuleDialogProps {
  connection: ConnectionItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

interface RuleOption {
  type: string
  payload: string
  label: string
  icon: typeof Globe
}

export function QuickRuleDialog({ connection, open, onOpenChange, onCreated }: QuickRuleDialogProps) {
  const t = useTranslations('connections')
  const common = useTranslations('common')
  const { activeProfile } = useProfiles()
  const { proxies } = useProxies()

  const [selectedType, setSelectedType] = useState<string>('DOMAIN-SUFFIX')
  const [payload, setPayload] = useState<string>('')
  const [selectedAction, setSelectedAction] = useState<string>('DIRECT')
  const [position, setPosition] = useState<'top' | 'bottom'>('top')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Extract available proxy groups
  const availableGroups = useMemo(() => {
    const groups: string[] = []
    for (const [name, node] of Object.entries(proxies)) {
      if (node.type === 'Selector' || node.type === 'URLTest' || node.type === 'Fallback') {
        groups.push(name)
      }
    }
    return groups
  }, [proxies])

  // Generate candidate options from connection
  const candidateOptions = useMemo<RuleOption[]>(() => {
    if (!connection) return []
    const opts: RuleOption[] = []
    const metadata = connection.metadata
    const host = metadata.host || metadata.sniffHost
    const procName = getProcessDisplayName(metadata.processPath, metadata.process, '')

    if (host) {
      const subDomains = getSubDomains(host)
      if (subDomains.length > 0) {
        opts.push({
          type: 'DOMAIN-SUFFIX',
          payload: subDomains[0],
          label: `DOMAIN-SUFFIX: ${subDomains[0]}`,
          icon: Globe
        })
      }
      opts.push({
        type: 'DOMAIN',
        payload: host,
        label: `DOMAIN: ${host}`,
        icon: Globe
      })
    }

    if (procName) {
      opts.push({
        type: 'PROCESS-NAME',
        payload: procName,
        label: `PROCESS-NAME: ${procName}`,
        icon: AppWindow
      })
    }

    if (metadata.destinationIP) {
      const cidr = `${metadata.destinationIP}${isIPv6(metadata.destinationIP) ? '/128' : '/32'}`
      opts.push({
        type: 'IP-CIDR',
        payload: cidr,
        label: `IP-CIDR: ${cidr}`,
        icon: Network
      })
    }

    return opts
  }, [connection])

  // Pre-select first candidate on open
  useEffect(() => {
    if (open && candidateOptions.length > 0) {
      const first = candidateOptions[0]
      setSelectedType(first.type)
      setPayload(first.payload)
      setSelectedAction('DIRECT')
      setPosition('top')
      setSaved(false)
      setError(null)
    }
  }, [open, candidateOptions])

  const handleSelectOption = (opt: RuleOption) => {
    setSelectedType(opt.type)
    setPayload(opt.payload)
  }

  const handleSave = async () => {
    if (!window.api || !activeProfile || !payload.trim() || saving) {
      if (!activeProfile) setError(t('noActiveProfile'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const existing = await window.api.profiles.getCustomRules(activeProfile.id)
      const newRule: CustomRuleItem = {
        id: createRuleId(),
        type: selectedType,
        payload: payload.trim(),
        proxy: selectedAction,
        position
      }

      const updated = position === 'bottom' ? [...existing, newRule] : [newRule, ...existing]
      await window.api.profiles.saveCustomRules(activeProfile.id, updated)
      setSaved(true)
      onCreated?.()
      setTimeout(() => {
        onOpenChange(false)
        setSaved(false)
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!connection) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 rounded-2xl">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <ShieldPlus className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">{t('quickRule')}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t('quickRuleDescription')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Target options selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('ruleTarget')}</span>
            <div className="flex flex-col gap-1.5">
              {candidateOptions.map((opt) => {
                const Icon = opt.icon
                const isSelected = selectedType === opt.type && payload === opt.payload
                return (
                  <button
                    key={`${opt.type}-${opt.payload}`}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left cursor-pointer ${
                      isSelected
                        ? 'border-primary/60 bg-primary/10 text-foreground font-semibold shadow-xs'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="size-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{opt.payload}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0 font-normal">
                      {opt.type}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Editable payload field */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium font-mono">{selectedType}</span>
            </div>
            <Input
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="font-mono text-xs h-8"
              placeholder={t('rulePayload')}
            />
          </div>

          {/* Action selection: DIRECT, PROXY, REJECT */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('ruleAction')}</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedAction('DIRECT')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  selectedAction === 'DIRECT'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <span className="text-[11px] font-bold font-mono">{'DIRECT'}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-full">
                  {t('directDescription')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction(availableGroups[0] || 'GLOBAL')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  selectedAction !== 'DIRECT' && selectedAction !== 'REJECT'
                    ? 'border-blue-500/60 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <span className="text-[11px] font-bold font-mono">{'PROXY'}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-full">
                  {t('proxyDescription')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction('REJECT')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  selectedAction === 'REJECT'
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <span className="text-[11px] font-bold font-mono">{'REJECT'}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-full">
                  {t('rejectDescription')}
                </span>
              </button>
            </div>
          </div>

          {/* Position selection */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
            <span className="text-muted-foreground">{t('position')}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPosition('top')}
                className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  position === 'top' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {t('positionTop')}
              </button>
              <button
                type="button"
                onClick={() => setPosition('bottom')}
                className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  position === 'bottom' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {t('positionBottom')}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {common('close')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || saved || !payload.trim()}
            className="gap-1.5"
          >
            {saving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <ShieldPlus className="size-3.5" />
            )}
            <span>{saved ? t('ruleCreated') : t('createRule')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
