import { Activity } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import { CopyableCodeLine } from '../CopyableCodeLine'
import { createCidrRuleOption } from '../../lib/connections'
import { useTranslations } from '../../i18n'
import { ConnectionSection } from './ConnectionSection'

export interface ConnectionSourceSectionProps {
  metadata: ConnectionItem['metadata']
}

export function ConnectionSourceSection({ metadata }: ConnectionSourceSectionProps) {
  const t = useTranslations('connections')

  return (
    <ConnectionSection icon={Activity} title={`${t('source')} & ${t('inbound')}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <CopyableCodeLine
          label={t('source')}
          value={`${metadata.sourceIP}:${metadata.sourcePort}`}
        />

        <CopyableCodeLine
          label={t('sourceIP')}
          value={metadata.sourceIP}
          clashRuleOptions={[createCidrRuleOption('SRC-IP-CIDR', metadata.sourceIP)]}
        />

        <CopyableCodeLine
          label={t('sourcePort')}
          value={metadata.sourcePort}
          clashRuleOptions={[
            { label: 'SRC-PORT', value: `SRC-PORT,${metadata.sourcePort}` }
          ]}
        />

        {metadata.inboundIP && (
          <CopyableCodeLine
            label={t('inboundIP')}
            value={metadata.inboundIP}
            clashRuleOptions={[createCidrRuleOption('SRC-IP-CIDR', metadata.inboundIP)]}
          />
        )}

        {metadata.inboundPort && metadata.inboundPort !== '0' && (
          <CopyableCodeLine
            label={t('inboundPort')}
            value={metadata.inboundPort}
            clashRuleOptions={[
              { label: 'SRC-PORT', value: `SRC-PORT,${metadata.inboundPort}` }
            ]}
          />
        )}

        {metadata.inboundName && (
          <CopyableCodeLine
            label={t('inboundName')}
            value={metadata.inboundName}
            clashRuleOptions={[
              { label: 'IN-NAME', value: `IN-NAME,${metadata.inboundName}` }
            ]}
          />
        )}

        {metadata.inboundUser && (
          <CopyableCodeLine
            label={t('inboundUser')}
            value={metadata.inboundUser}
            clashRuleOptions={[
              { label: 'IN-USER', value: `IN-USER,${metadata.inboundUser}` }
            ]}
          />
        )}
      </div>
    </ConnectionSection>
  )
}
