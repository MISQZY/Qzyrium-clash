import { useTranslations } from '../../i18n'

import { ConnectionsIcon } from '../../lib/icons'

import { Card } from '../ui/card'

interface ConnectionEmptyStateProps {
  query: string
}

export function ConnectionEmptyState({ query }: ConnectionEmptyStateProps) {
  const t = useTranslations('connections')

  return (
<Card className="p-8 text-center flex flex-col items-center justify-center gap-3 border-dashed">
              <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                <ConnectionsIcon className="size-6" />
              </div>
              <p className="text-xs text-muted-foreground">
                {query ? t('noConnectionsMatchYourSearch') : t('noActiveConnections')}
              </p>
            </Card>
  )
}
