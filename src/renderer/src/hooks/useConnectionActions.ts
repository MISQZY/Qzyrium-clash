import { type ProcessGroup } from '../lib/connections'
import { useTranslations } from '../i18n'
import { useState } from 'react'

import type { ConnectionItem } from '@shared/mihomo'

export function useConnectionActions(onRefresh: () => void) {
  const t = useTranslations('connections')
  const [selectedConnection, setSelectedConnection] = useState<ConnectionItem | null>(null)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')

  const close = async (id?: string) => {
    if (!window.api || closing || (!id && !confirm(t('terminateAllActiveSessions')))) return
    setClosing(true)
    setError('')
    try {
      if (id) {
        await window.api.mihomo.closeConnection(id)
        if (selectedConnection?.id === id) {
          setSelectedConnection(null)
        }
      } else {
        await window.api.mihomo.closeAllConnections()
        setSelectedConnection(null)
      }
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClosing(false)
    }
  }

  const closeProcessConnections = async (group: ProcessGroup) => {
    if (!window.api || closing) return
    setClosing(true)
    setError('')
    try {
      await Promise.all(group.connections.map((item) => window.api.mihomo.closeConnection(item.id)))
      if (selectedConnection && group.connections.some((c) => c.id === selectedConnection.id)) {
        setSelectedConnection(null)
      }
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClosing(false)
    }
  }

  return { selectedConnection, setSelectedConnection, closing, error, close, closeProcessConnections }
}

export type ConnectionActions = ReturnType<typeof useConnectionActions>
