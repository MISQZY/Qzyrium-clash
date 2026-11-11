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
    <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary shrink-0 border border-primary/20">
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
      className: 'border-success/40 bg-success/10 text-success'
    }
  }
  if (raw === 'selector' || raw === 'select') {
    return {
      label: 'SELECTOR',
      className: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400'
    }
  }
  if (raw === 'fallback') {
    return {
      label: 'FALLBACK',
      className: 'border-warning/40 bg-warning/10 text-warning'
    }
  }
  if (raw === 'loadbalance') {
    return {
      label: 'LOAD-BALANCE',
      className: 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400'
    }
  }
  if (raw === 'relay') {
    return {
      label: 'RELAY',
      className: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
    }
  }
  return {
    label: (type || 'GROUP').toUpperCase(),
    className: 'border-border/80 bg-muted/50 text-muted-foreground'
  }
}

