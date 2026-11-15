import { AppWindow } from 'lucide-react'
import type { ConnectionItem } from '@shared/mihomo'
import { CopyableCodeLine } from '../CopyableCodeLine'
import { getProcessDisplayName } from '../../lib/connections'
import { useTranslations } from '../../i18n'
import { ConnectionSection } from './ConnectionSection'

export interface ConnectionApplicationSectionProps {
  metadata: ConnectionItem['metadata']
}

export function ConnectionApplicationSection({ metadata }: ConnectionApplicationSectionProps) {
  const t = useTranslations('connections')
  const procName = getProcessDisplayName(metadata.processPath, metadata.process, t('system'))

  return (
    <ConnectionSection icon={AppWindow} title={t('processName')}>
      <div className="flex flex-col gap-2.5">
        <CopyableCodeLine
          label={t('processName')}
          value={procName}
          clashRuleOptions={[
            {
              label: 'PROCESS-NAME',
              value: `PROCESS-NAME,${procName === t('system') ? '' : procName}`
            }
          ]}
        />

        {metadata.processPath && (
          <CopyableCodeLine
            label={t('processPath')}
            value={metadata.processPath}
            truncate={false}
            clashRuleOptions={[
              {
                label: 'PROCESS-PATH',
                value: `PROCESS-PATH,${metadata.processPath}`
              }
            ]}
          />
        )}
      </div>
    </ConnectionSection>
  )
}
