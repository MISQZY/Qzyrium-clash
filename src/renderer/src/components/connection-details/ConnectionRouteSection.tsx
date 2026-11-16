import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import { Layers, Copy, Check } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import { CopyableCodeLine } from '../CopyableCodeLine'
import { EmojiText } from '../EmojiText'
import { formatChain } from '../../lib/connections'
import { useTranslations } from '../../i18n'
import { ConnectionSection } from './ConnectionSection'

export interface ConnectionRouteSectionProps {
  connection: ConnectionItem
}

export function ConnectionRouteSection({ connection }: ConnectionRouteSectionProps) {
  const { handleCopy, copiedKey } = useCopyFeedback()
  const t = useTranslations('connections')
  const chainVal = formatChain(connection.chains)
  const chainCopyKey = `chain-${connection.id}`

  return (
    <ConnectionSection icon={Layers} title={t('route')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <CopyableCodeLine label={t('rule')} value={connection.rule} />

        {connection.rulePayload && (
          <CopyableCodeLine label={t('rulePayload')} value={connection.rulePayload} />
        )}

        <div className="sm:col-span-2">
          <CopyableCodeLine
            label={t('ruleDefinition')}
            value={
              connection.rulePayload
                ? `${connection.rule}(${connection.rulePayload})`
                : connection.rule
            }
          />
        </div>

        <div className="sm:col-span-2 flex flex-col gap-1 w-full min-w-0">
          <span className="text-[11px] font-medium text-muted-foreground">{t('chains')}</span>
          <div
            className="group/chainline relative flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-border/70 bg-muted/30 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 cursor-pointer"
            onClick={() => {
              void handleCopy(chainVal, chainCopyKey)
            }}
            title={chainVal}
          >
            <span className="select-all text-xs leading-relaxed text-foreground min-w-0 flex-1 break-words">
              <EmojiText text={chainVal} />
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void handleCopy(chainVal, chainCopyKey)
              }}
              title={copiedKey === chainCopyKey ? t('copied') : t('copy')}
              aria-label={copiedKey === chainCopyKey ? t('copied') : t('copy')}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {copiedKey === chainCopyKey ? (
                <Check className="size-3.5 text-success animate-in zoom-in-75 duration-150" />
              ) : (
                <Copy className="size-3.5 opacity-60 group-hover/chainline:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
        </div>

        <CopyableCodeLine
          label={t('network')}
          value={connection.metadata.network.toUpperCase()}
          clashRuleOptions={[
            {
              label: 'NETWORK',
              value: `NETWORK,${connection.metadata.network.toLowerCase()}`
            }
          ]}
        />

        <CopyableCodeLine
          label={t('type')}
          value={connection.metadata.type || 'Direct'}
        />
      </div>
    </ConnectionSection>
  )
}
