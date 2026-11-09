import { useState, useEffect, ReactNode } from 'react'

interface ProfileLogoProps {
  url?: string
  className?: string
  fallback: ReactNode
}

export function ProfileLogo({ url, className, fallback }: ProfileLogoProps) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [url])

  if (url && !hasError) {
    return (
      <img
        src={url}
        alt=""
        className={className}
        onError={() => setHasError(true)}
      />
    )
  }

  return <>{fallback}</>
}
