import { Clock } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import { CopyableCodeLine } from '../CopyableCodeLine'
import { formatDurationFromStart } from '../../lib/format'
import { useLocale, useTranslations } from '../../i18n'
import { ConnectionSection } from './ConnectionSection'

export interface ConnectionMetadataSectionProps {
  connection: ConnectionItem
}

export function ConnectionMetadataSection({ connection }: ConnectionMetadataSectionProps) {
  const t = useTranslations('connections')
  const locale = useLocale()

  return (
    <ConnectionSection icon={Clock} title={`${t('connectionId')} & ${t('duration')}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="sm:col-span-2">
          <CopyableCodeLine
            label={t('connectionId')}
            value={connection.id}
            truncate={false}
          />
        </div>

        {connection.metadata.dnsMode && (
          <CopyableCodeLine
            label={t('dnsMode')}
            value={connection.metadata.dnsMode}
          />
        )}

        <CopyableCodeLine
          label={t('startTime')}
          value={new Date(connection.start).toLocaleTimeString(locale, { hour12: false })}
        />

        <CopyableCodeLine
          label={t('duration')}
          value={formatDurationFromStart(connection.start)}
        />
      </div>
    </ConnectionSection>
  )
}
