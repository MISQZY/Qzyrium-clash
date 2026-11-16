import { useLayoutEffect, useMemo, useRef } from 'react'

export interface AutoFitTrafficTextProps {
  text: string
}

export function AutoFitTrafficText({ text }: AutoFitTrafficTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  const fontSize = useMemo(() => {
    if (text.length <= 5) return 19
    if (text.length <= 7) return 17
    if (text.length <= 8) return 15
    if (text.length <= 10) return 13.5
    if (text.length <= 12) return 12
    return 11
  }, [text])

  const updateScale = () => {
    const container = containerRef.current
    const textEl = textRef.current
    if (!container || !textEl) return
    textEl.style.transform = 'none'
    const containerWidth = container.clientWidth
    const textWidth = textEl.scrollWidth
    if (containerWidth > 0 && textWidth > 0 && textWidth > containerWidth) {
      const scale = Math.max(0.65, (containerWidth - 1) / textWidth)
      textEl.style.transform = `scale(${scale})`
    } else {
      textEl.style.transform = ''
    }
  }

  useLayoutEffect(() => {
    updateScale()
  }, [text, fontSize])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      updateScale()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="mt-1.5 w-full flex items-center justify-center overflow-visible"
      style={{ minHeight: '1.65rem', height: '1.65rem' }}
    >
      <span
        ref={textRef}
        className="overview-traffic-value font-medium tabular-nums text-center whitespace-nowrap select-text inline-block will-change-transform"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: '1.65rem',
          transformOrigin: 'center center'
        }}
      >
        {text}
      </span>
    </div>
  )
}
