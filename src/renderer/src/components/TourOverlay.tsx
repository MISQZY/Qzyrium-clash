import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { TOUR_STEPS, useTour } from '../providers/TourProvider'
import { useNavigation } from '../stores/useAppStore'
import { useTranslations } from '../i18n'
import { Button } from './ui/button'
import { TourMascot, type MascotPose } from './TourMascot'

const STEP_POSES: Record<typeof TOUR_STEPS[number]['id'], MascotPose> = {
  welcome: 'smirk', navigation: 'navigate', profiles: 'file', proxies: 'cool',
  capture: 'guard', connect: 'power', routing: 'confused', connections: 'navigate', finish: 'peace'
}
import { placeTourMascot, type TourBox } from '../lib/tour-layout'

const clamp = (value: number, max: number) => Math.max(12, Math.min(value, max))

export function TourOverlay() {
  const { index, next, back, stop } = useTour()
  return index === null ? null : <TourStep index={index} next={next} back={back} stop={stop} />
}

function TourStep({ index, next, back, stop }: { index: number; next: () => void; back: () => void; stop: () => void }) {
  const step = TOUR_STEPS[index]
  const target = 'target' in step ? step.target : undefined
  const { activeTab } = useNavigation()
  const t = useTranslations('app')
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const [measurement, setMeasurement] = useState<{ index: number; rect: DOMRect | null } | null>(null)
  const ready = measurement?.index === index
  const rect = ready ? measurement.rect : null
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [mascot, setMascot] = useState<TourBox | null>(null)
  const [titlebarBottom, setTitlebarBottom] = useState(37)
  const lastPlacement = useRef<{ index: number; w: number; h: number; left: number; top: number; mascot: TourBox | null } | null>(null)

  useLayoutEffect(() => {
    const titlebar = document.querySelector('.app-titlebar')
    if (!titlebar) return
    const measure = () => setTitlebarBottom(titlebar.getBoundingClientRect().bottom)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(titlebar)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  useEffect(() => {
    if (!target) { setMeasurement({ index, rect: null }); return }
    let found: HTMLElement | null = null
    let candidate: DOMRect | null = null
    let published: DOMRect | null = null
    let stableSince = performance.now()
    const started = stableSince
    let fallback = false
    const same = (a: DOMRect | null, b: DOMRect | null) => !!a && !!b && (['left', 'top', 'width', 'height'] as const).every(key => Math.abs(a[key] - b[key]) < .5)
    const track = () => {
      const element = activeTab === step.page ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null
      if (element && element !== found) {
        found = element
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
      }
      const bounds = element?.getBoundingClientRect()
      const valid = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null
      const now = performance.now()
      if (!valid) {
        candidate = null
        stableSince = now
        // Keep the card in place while a lazy page loads; missing targets still get a usable fallback.
        if (!published && !fallback && now - started >= 2000) {
          fallback = true
          setMeasurement({ index, rect: null })
        }
        return
      }
      if (!same(candidate, valid)) { candidate = valid; stableSince = now }
      if (now - stableSince >= 160 && !same(published, valid)) {
        published = valid
        setMeasurement({ index, rect: valid })
      }
    }
    track()
    // Publish only settled geometry, rather than every intermediate loading frame.
    const timer = window.setInterval(track, 50)
    window.addEventListener('resize', track)
    document.addEventListener('scroll', track, true)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', track)
      document.removeEventListener('scroll', track, true)
    }
  }, [target, activeTab, step.page, index])

  useLayoutEffect(() => {
    const element = card
    if (!element || !ready) return
    const positionCard = () => {
      const { width, height } = element.getBoundingClientRect()
      const w = window.innerWidth, h = window.innerHeight
      const minTop = titlebarBottom + 12
      const clampTop = (value: number) => Math.max(minTop, Math.min(value, h - height - 12))
      let left = (w - width) / 2, top = titlebarBottom + (h - titlebarBottom - height) / 2
      if (rect) {
        const candidates = [
          { left: rect.right + 18, top: rect.top + (rect.height - height) / 2 },
          { left: rect.left - width - 18, top: rect.top + (rect.height - height) / 2 },
          { left: rect.left + (rect.width - width) / 2, top: rect.bottom + 18 },
          { left: rect.left + (rect.width - width) / 2, top: rect.top - height - 18 }
        ].map(p => ({ left: clamp(p.left, w - width - 12), top: clampTop(p.top) }))
        // Prefer a placement that does not cover the highlighted control.
        const best = candidates.find(p => p.left >= rect.right + 10 || p.left + width <= rect.left - 10 || p.top >= rect.bottom + 10 || p.top + height <= rect.top - 10)
        if (best) { left = best.left; top = best.top }
      }
      const previous = lastPlacement.current
      const overlaps = (box: TourBox, other: TourBox, gap = 10) => box.left < other.left + other.width + gap && box.left + box.width > other.left - gap && box.top < other.top + other.height + gap && box.top + box.height > other.top - gap
      // Once placed for this step, retain the anchor through harmless layout shifts.
      if (previous?.index === index && previous.w === w && previous.h === h) {
        const oldBox = { left: previous.left, top: previous.top, width, height }
        if (oldBox.top >= minTop && oldBox.top + height <= h - 12 && (!rect || !overlaps(oldBox, rect))) {
          left = previous.left
          top = previous.top
        }
      }
      const placed = { left: clamp(left, w - width - 12), top: clampTop(top) }
      setPosition(placed)
      let nextMascot = placeTourMascot(
        { left: 16, top: titlebarBottom + 16, width: w - 32, height: h - titlebarBottom - 32 },
        { ...placed, width, height },
        rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
      )
      const oldMascot = previous?.mascot
      if (previous?.index === index && previous.w === w && previous.h === h && oldMascot && !overlaps(oldMascot, { ...placed, width, height }) && (!rect || !overlaps(oldMascot, rect))) nextMascot = oldMascot
      setMascot(nextMascot)
      lastPlacement.current = { index, w, h, ...placed, mascot: nextMascot }
    }
    positionCard()
    const observer = new ResizeObserver(positionCard)
    observer.observe(element)
    window.addEventListener('resize', positionCard)
    return () => { observer.disconnect(); window.removeEventListener('resize', positionCard) }
  }, [rect, card, titlebarBottom, ready, index])

  return <Dialog.Root open onOpenChange={open => { if (!open) stop() }}>
    <Dialog.Portal>
      <div className="tour-layer" style={{ top: titlebarBottom }}>
      <Dialog.Overlay className="tour-overlay">
        {rect ? <div className="tour-spotlight" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }} /> : <div className="tour-dimmer" />}
      </Dialog.Overlay>
      {mascot && <div className="tour-free-mascot" style={mascot} aria-hidden="true"><TourMascot pose={STEP_POSES[step.id]} /></div>}
      <Dialog.Content ref={setCard} className="tour-card" style={{ ...position, opacity: position ? 1 : 0, maxHeight: `calc(100dvh - ${titlebarBottom + 24}px)` }}
        onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}
        onCloseAutoFocus={event => {
          event.preventDefault()
          document.querySelector<HTMLElement>('[data-tour="restart-tour"]')?.focus({ preventScroll: true })
        }}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-muted-foreground">{t('tourCounter', { current: index + 1, total: TOUR_STEPS.length })}</span>
          <Dialog.Close className="tour-close" aria-label={t('tourClose')}><X className="size-4" /></Dialog.Close>
        </div>
        <div aria-live="polite">
          <Dialog.Title className="text-base font-semibold tracking-tight">{t(`tour_${step.id}_title`)}</Dialog.Title>
          <Dialog.Description className="tour-description mt-2 text-xs leading-relaxed text-muted-foreground">{t(`tour_${step.id}_description`, { name: t('tourMascotName') })}</Dialog.Description>
        </div>
        <div className="tour-progress" aria-hidden="true">{TOUR_STEPS.map((item, i) => <span key={item.id} data-complete={i <= index} />)}</div>
        <div className="flex items-center justify-between gap-2">
          {index > 0 ? <Button size="sm" variant="outline" onClick={back}><ArrowLeft className="size-3.5" />{t('tourBack')}</Button> : <Button size="sm" variant="ghost" onClick={stop}>{t('tourSkip')}</Button>}
          <Button size="sm" onClick={next}>{t(index === TOUR_STEPS.length - 1 ? 'tourFinish' : 'tourNext')}<ArrowRight className="size-3.5" /></Button>
        </div>
      </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>
}
