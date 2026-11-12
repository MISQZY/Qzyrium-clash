import React, { useState, useEffect } from 'react'
import { ProxiesIcon } from '../lib/icons'
import { cn } from '../lib/utils'

export const GroupIcon: React.FC<{ icon?: string; name: string }> = ({ icon, name }) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [icon])

  if (icon && !hasError) {
    return (
      <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 shrink-0 border border-border/70 overflow-hidden p-1">
        <img
          src={icon}
          alt={name}
          className="size-full object-contain"
          onError={() => setHasError(true)}
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 text-muted-foreground shrink-0 border border-border/70">
      <ProxiesIcon className="size-4" />
    </div>
  )
}

export const NodeIcon: React.FC<{ icon?: string; name: string; isSelected: boolean }> = ({
  icon,
  name,
  isSelected
}) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [icon])

  if (icon && !hasError) {
    return (
      <img
        src={icon}
        alt={name}
        className="size-3.5 object-contain shrink-0 rounded-xs"
        onError={() => setHasError(true)}
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={cn(
        'size-2 rounded-full shrink-0 transition-colors',
        isSelected ? 'bg-primary shadow-xs shadow-primary' : 'bg-muted-foreground/30'
      )}
    />
  )
}

export const getGroupTypeStyle = (type?: string): { label: string; className: string } => {
  const raw = (type || '').toLowerCase().replace(/[-_]/g, '')
  if (raw === 'urltest') {
    return {
      label: 'AUTO',
      className: 'text-muted-foreground'
    }
  }
  if (raw === 'selector' || raw === 'select') {
    return {
      label: 'SELECTOR',
      className: 'text-muted-foreground'
    }
  }
  if (raw === 'fallback') {
    return {
      label: 'FALLBACK',
      className: 'text-muted-foreground'
    }
  }
  if (raw === 'loadbalance') {
    return {
      label: 'LOAD-BALANCE',
      className: 'text-muted-foreground'
    }
  }
  if (raw === 'relay') {
    return {
      label: 'RELAY',
      className: 'text-muted-foreground'
    }
  }
  return {
    label: (type || 'GROUP').toUpperCase(),
    className: 'text-muted-foreground'
  }
}

