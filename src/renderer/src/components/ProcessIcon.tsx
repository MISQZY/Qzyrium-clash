import { useState, useEffect } from 'react'
import { Globe, Terminal, Share2, AppWindow } from 'lucide-react'
import druseSvg from '../assets/brand/druse.svg'
import { extractProcessName } from '../lib/connections'

export function getAppCategoryIcon(processName: string) {
  const lower = processName.toLowerCase()
  if (
    lower.includes('chrome') ||
    lower.includes('msedge') ||
    lower.includes('edge') ||
    lower.includes('firefox') ||
    lower.includes('brave') ||
    lower.includes('opera') ||
    lower.includes('safari') ||
    lower.includes('vivaldi') ||
    lower.includes('yandex')
  ) {
    return Globe
  }
  if (
    lower.includes('terminal') ||
    lower.includes('cmd') ||
    lower.includes('powershell') ||
    lower.includes('pwsh') ||
    lower.includes('bash') ||
    lower.includes('node') ||
    lower.includes('git') ||
    lower.includes('curl') ||
    lower.includes('python') ||
    lower.includes('code')
  ) {
    return Terminal
  }
  if (
    lower.includes('telegram') ||
    lower.includes('discord') ||
    lower.includes('slack') ||
    lower.includes('whatsapp') ||
    lower.includes('signal')
  ) {
    return Share2
  }
  return AppWindow
}

const MAX_CLIENT_ICON_CACHE = 80
const clientIconCache = new Map<string, string>()

function setClientIcon(path: string, url: string): void {
  if (clientIconCache.size >= MAX_CLIENT_ICON_CACHE) {
    const oldest = clientIconCache.keys().next().value
    if (oldest) clientIconCache.delete(oldest)
  }
  clientIconCache.set(path, url)
}

export function ProcessIcon({
  processPath,
  processName,
  className = 'size-4.5',
  fallbackClassName = 'size-4.5'
}: {
  processPath?: string
  processName?: string
  className?: string
  fallbackClassName?: string
}) {
  const name = processName || extractProcessName(processPath) || ''
  const lowerName = name.toLowerCase()
  const lowerPath = (processPath || '').toLowerCase()
  const isQzyrium =
    lowerName.includes('qzyrium') ||
    lowerName === 'qzyrium-clash' ||
    lowerName === 'qzyrium-clash.exe' ||
    lowerPath.includes('qzyrium')

  if (isQzyrium) {
    return (
      <img
        src={druseSvg}
        alt={name || 'Qzyrium-clash'}
        className={`${className} object-contain rounded-xs select-none`}
      />
    )
  }

  return <FileProcessIcon processPath={processPath} name={name} className={className} fallbackClassName={fallbackClassName} />
}

function FileProcessIcon({ processPath, name, className, fallbackClassName }: {
  processPath?: string; name: string; className: string; fallbackClassName: string
}) {
  const [iconUrl, setIconUrl] = useState<string | null>(() => {
    if (!processPath) return null
    return clientIconCache.get(processPath) || null
  })

  useEffect(() => {
    if (!processPath || !window.api?.app?.getProcessIcon) return
    if (clientIconCache.has(processPath)) {
      setIconUrl(clientIconCache.get(processPath) || null)
      return
    }
    let active = true
    window.api.app.getProcessIcon(processPath).then((url) => {
      if (active) {
        setClientIcon(processPath, url || '')
        if (url) {
          setIconUrl(url)
        }
      }
    }).catch(() => {
      setClientIcon(processPath, '')
    })
    return () => {
      active = false
    }
  }, [processPath])

  const FallbackIcon = getAppCategoryIcon(name)

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        className={`${className} object-contain rounded-xs select-none`}
        onError={() => {
          setClientIcon(processPath || '', '')
          setIconUrl(null)
        }}
      />
    )
  }

  return <FallbackIcon className={fallbackClassName} />
}

