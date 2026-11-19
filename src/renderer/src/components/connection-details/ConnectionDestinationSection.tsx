import { Globe } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import { CopyableCodeLine } from '../CopyableCodeLine'
import { getSubDomains, createCidrRuleOption } from '../../lib/connections'
import { useTranslations } from '../../i18n'
import { ConnectionSection } from './ConnectionSection'

export interface ConnectionDestinationSectionProps {
  metadata: ConnectionItem['metadata']
}

export function ConnectionDestinationSection({ metadata }: ConnectionDestinationSectionProps) {
  const t = useTranslations('connections')

  return (
    <ConnectionSection icon={Globe} title={t('destination')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {metadata.host && (
          <div className="sm:col-span-2">
            <CopyableCodeLine
              label={t('host')}
              value={metadata.host}
              clashRuleOptions={[
                { label: 'DOMAIN', value: `DOMAIN,${metadata.host}` },
                ...getSubDomains(metadata.host).map((sub) => ({
                  label: 'DOMAIN-SUFFIX',
                  value: `DOMAIN-SUFFIX,${sub}`
                }))
              ]}
            />
          </div>
        )}

        {metadata.sniffHost && (
          <div className="sm:col-span-2">
            <CopyableCodeLine
              label={t('sniffHost')}
              value={metadata.sniffHost}
              clashRuleOptions={[
                { label: 'DOMAIN', value: `DOMAIN,${metadata.sniffHost}` },
                { label: 'DOMAIN-SUFFIX', value: `DOMAIN-SUFFIX,${metadata.sniffHost}` }
              ]}
            />
          </div>
        )}

        <CopyableCodeLine
          label={t('destination')}
          value={`${metadata.destinationIP}:${metadata.destinationPort}`}
        />

        <CopyableCodeLine
          label={t('destinationIP')}
          value={metadata.destinationIP}
          clashRuleOptions={[createCidrRuleOption('IP-CIDR', metadata.destinationIP)]}
        />

        <CopyableCodeLine
          label={t('destinationPort')}
          value={metadata.destinationPort}
          clashRuleOptions={[
            { label: 'DST-PORT', value: `DST-PORT,${metadata.destinationPort}` }
          ]}
        />

        {metadata.remoteDestination && (
          <CopyableCodeLine
            label={t('remoteDestination')}
            value={metadata.remoteDestination}
            clashRuleOptions={[createCidrRuleOption('IP-CIDR', metadata.remoteDestination)]}
          />
        )}

        {metadata.destinationIPASN && (
          <CopyableCodeLine
            label="ASN"
            value={metadata.destinationIPASN}
            clashRuleOptions={[
              {
                label: 'IP-ASN',
                value: `IP-ASN,${metadata.destinationIPASN.split(' ')[0]}`
              }
            ]}
          />
        )}

        {metadata.destinationGeoIP && metadata.destinationGeoIP.length > 0 && (
          <CopyableCodeLine
            label="GeoIP"
            value={metadata.destinationGeoIP.join(', ')}
            clashRuleOptions={metadata.destinationGeoIP.map((code) => ({
              label: 'GEOIP',
              value: `GEOIP,${code}`
            }))}
          />
        )}
      </div>
    </ConnectionSection>
  )
}
