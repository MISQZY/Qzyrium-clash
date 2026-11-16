import { useState, useEffect, ReactNode, CSSProperties } from 'react'

interface ProfileLogoProps {
  url?: string
  className?: string
  fallback: ReactNode
  loaderClassName?: string
  loaderSize?: number
}

const loadedUrls = new Set<string>()

function isValidLogoUrl(url?: string): boolean {
  if (!url) return false
  return url.startsWith('https://') || url.startsWith('data:image/')
}

export function ProfileLogo({ url, className, fallback, loaderClassName, loaderSize }: ProfileLogoProps) {
  const isSafeUrl = isValidLogoUrl(url)
  const [hasError, setHasError] = useState(!isSafeUrl)
  const [isLoading, setIsLoading] = useState(() => Boolean(isSafeUrl && url && !loadedUrls.has(url)))
  const [prevUrl, setPrevUrl] = useState(url)

  if (url !== prevUrl) {
    setPrevUrl(url)
    const valid = isValidLogoUrl(url)
    setHasError(!valid)
    setIsLoading(Boolean(valid && url && !loadedUrls.has(url)))
  }

  useEffect(() => {
    if (!url || !isValidLogoUrl(url)) {
      setHasError(!url || !isValidLogoUrl(url))
      setIsLoading(false)
      return
    }

    if (loadedUrls.has(url)) {
      setHasError(false)
      setIsLoading(false)
      return
    }

    let active = true
    const img = new Image()
    img.referrerPolicy = 'no-referrer'

    const handleSuccess = () => {
      if (!active) return
      clearTimeout(timer)
      loadedUrls.add(url)
      setIsLoading(false)
    }

    const handleError = () => {
      if (!active) return
      clearTimeout(timer)
      loadedUrls.delete(url)
      setHasError(true)
      setIsLoading(false)
    }

    const timer = setTimeout(handleError, 10000)

    img.onload = handleSuccess
    img.onerror = handleError
    img.src = url

    if (img.complete) {
      clearTimeout(timer)
      if (img.naturalWidth > 0) {
        handleSuccess()
      } else {
        handleError()
      }
      return () => {
        active = false
      }
    }

    return () => {
      active = false
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
    }
  }, [url])

  if (!url || hasError) {
    return <>{fallback}</>
  }

  const isLarge = className?.includes('size-7')
  const size = loaderSize ?? (isLarge ? 18 : undefined)
  const loaderStyle: CSSProperties = {
    '--latency-loader-margin': '0px',
    ...(size
      ? {
          '--latency-loader-size': `${size}px`,
          '--latency-loader-border': size >= 16 ? '2px' : '1.5px'
        }
      : {})
  } as CSSProperties

  if (isLoading) {
    return (
      <span
        className={`latency-loader shrink-0 ${loaderClassName ?? ''}`.trim()}
        style={loaderStyle}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        loadedUrls.delete(url)
        setHasError(true)
      }}
    />
  )
}

