import { type ProcessGroup } from '../lib/connections'
import { useTranslations } from '../i18n'
import { useEffect, useRef, useState } from 'react'

import type { ConnectionItem } from '@shared/mihomo'

export function useConnectionActions(onRefresh: () => void) {
  const t = useTranslations('connections')
  const [selectedConnection, setSelectedConnection] = useState<ConnectionItem | null>(null)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const close = async (id?: string) => {
    if (!window.api || closing || (!id && !confirm(t('terminateAllActiveSessions')))) return
    setClosing(true)
    setError('')
    try {
      if (id) {
        await window.api.mihomo.closeConnection(id)
        if (isMounted.current && selectedConnection?.id === id) {
          setSelectedConnection(null)
        }
      } else {
        await window.api.mihomo.closeAllConnections()
        if (isMounted.current) {
          setSelectedConnection(null)
        }
      }
      if (isMounted.current) onRefresh()
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (isMounted.current) setClosing(false)
    }
  }

  const closeProcessConnections = async (group: ProcessGroup) => {
    if (!window.api || closing) return
    setClosing(true)
    setError('')
    try {
      await Promise.all(group.connections.map((item) => window.api.mihomo.closeConnection(item.id)))
      if (isMounted.current && selectedConnection && group.connections.some((c) => c.id === selectedConnection.id)) {
        setSelectedConnection(null)
      }
      if (isMounted.current) onRefresh()
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (isMounted.current) setClosing(false)
    }
  }

  return { selectedConnection, setSelectedConnection, closing, error, close, closeProcessConnections }
}

export type ConnectionActions = ReturnType<typeof useConnectionActions>
