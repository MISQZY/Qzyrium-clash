import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Virtuoso } from 'react-virtuoso'

/** Keep small lists native; measure variable-height rows for large datasets. */
export function VirtualList<T>({ data, itemKey, renderItem, externalScroll = true, twoColumns = false,
  className = '', gap = 8, scrollParentSelector = '.page-scroll' }: {
  data: readonly T[]
  itemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  externalScroll?: boolean
  twoColumns?: boolean
  className?: string
  gap?: number
  scrollParentSelector?: string
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 640px)').matches)
  useEffect(() => {
    if (!twoColumns) return
    const media = matchMedia('(min-width: 640px)')
    const update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [twoColumns])
  const columns = twoColumns && wide ? 2 : 1
  const row = (index: number) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap, paddingBottom: gap }}>
      {data.slice(index * columns, (index + 1) * columns).map((item, offset) => (
        <Fragment key={itemKey(item, index * columns + offset)}>{renderItem(item, index * columns + offset)}</Fragment>
      ))}
    </div>
  )
  const parent = externalScroll ? host?.closest<HTMLElement>(scrollParentSelector) : undefined
  return <div ref={setHost} className={className} data-virtual-list={data.length > 80 ? 'true' : 'false'}
    style={externalScroll ? undefined : { height: '100%', minHeight: 0 }}>
    {data.length <= 80
      ? Array.from({ length: Math.ceil(data.length / columns) }, (_, index) => <Fragment key={itemKey(data[index * columns], index * columns)}>{row(index)}</Fragment>)
      : (!externalScroll || parent) && <Virtuoso
          customScrollParent={parent ?? undefined}
          totalCount={Math.ceil(data.length / columns)}
          computeItemKey={index => itemKey(data[index * columns], index * columns)}
          increaseViewportBy={160}
          itemContent={row}
        />}
  </div>
}
