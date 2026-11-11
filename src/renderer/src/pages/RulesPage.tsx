import { useTranslations } from '../i18n'
import React, { useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { RulesIcon } from '../lib/icons'
import type { MihomoRule } from '@shared/mihomo'
import { Page } from '../components/Page'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { CopyableCodeLine } from '../components/CopyableCodeLine'

export interface RulesPageProps {
  rules: MihomoRule[]
  running: boolean
  busy: boolean
  onRefresh: () => void
}

export function RulesPage({
  rules,
  running,
  busy,
  onRefresh
}: RulesPageProps) {
  const t = useTranslations('rules')

  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(0)

  const types = useMemo(() => [...new Set(rules.map((rule) => rule.type))].sort(), [rules])

  // Keep indexes rather than cloning every rule for a 100-row page.
  const filteredIndexes = useMemo(() => {
    const search = query.toLowerCase()
    const indexes: number[] = []
    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index]
      if (type !== 'all' && rule.type !== type) continue
      if (search && !`${rule.type} ${rule.payload} ${rule.proxy}`.toLowerCase().includes(search)) continue
      indexes.push(index)
    }
    return indexes
  }, [rules, query, type])

  const lastPage = Math.max(0, Math.ceil(filteredIndexes.length / 100) - 1)
  const currentPage = Math.min(page, lastPage)
  const visibleRules = filteredIndexes.slice(currentPage * 100, (currentPage + 1) * 100)
    .map(index => ({ ...rules[index], index }))

  return (
    <Page
      title={t('rules')}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={!running || busy}
          className="gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          <span>{t('refresh')}</span>
        </Button>
      }
    >
      {/* Search and Type Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-48 sm:min-w-64">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            aria-label={t('searchRules')}
            placeholder={t('searchDomainsNetworksOrOutboundGroups')}
            className="pl-9 h-8 text-xs"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            aria-label={t('ruleType')}
            value={type}
            onChange={(event) => {
              setType(event.target.value)
              setPage(0)
            }}
            className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">{t('allTypes')}</option>
            {types.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="text-xs tabular-nums text-muted-foreground">
            {filteredIndexes.length} / {rules.length}
          </span>
        </div>
      </div>

      {/* Applied Rules Table */}
      <Card className="overflow-x-auto">
        <table className="data-table rules-table">
          <thead>
            <tr>
              <th>№</th>
              <th>{t('type')}</th>
              <th>{t('match')}</th>
              <th>{t('outbound')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRules.map((rule) => (
              <tr key={rule.index}>
                <td className="text-muted-foreground tabular-nums whitespace-nowrap">{rule.index + 1}</td>
                <td>
                  <span className="rounded bg-muted px-2 py-1 text-[10px] font-mono">
                    {rule.type}
                  </span>
                </td>
                <td><CopyableCodeLine value={rule.payload || '*'} truncate={false} /></td>
                <td className="text-primary font-medium">{rule.proxy}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredIndexes.length === 0 && (
          <div className="empty-state py-10">
            <RulesIcon className="size-7 text-muted-foreground" />
            <p>
              {!running
                ? t('startMihomoToLoadTheActiveRules')
                : query || type !== 'all'
                ? t('noRulesMatchYourFilters')
                : t('noRoutingRulesReturnedByTheCore')}
            </p>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {filteredIndexes.length > 100 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {t('pagination', { page: currentPage + 1, total: lastPage + 1 })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {t('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </Page>
  )
}
