import { lazy, Suspense } from 'react'

import { LoaderCircle } from 'lucide-react'

import type { RuleEditorState } from '../../hooks/useRuleEditor'

const YamlEditor = lazy(() => import('../YamlEditor'))

export interface RuleYamlPanelProps {
  editor: Pick<RuleEditorState, 'rulesYamlContent' | 'setRulesYamlContent' | 'setError' | 'isDark'>

}

export function RuleYamlPanel({ editor }: RuleYamlPanelProps) {
  const { rulesYamlContent, setRulesYamlContent, setError, isDark } = editor

  return (
<div className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-background flex flex-col">
              <Suspense fallback={<div role="status" className="flex h-full items-center justify-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div>}>
                <YamlEditor
                  theme={isDark ? 'vs-dark' : 'light'}
                  value={rulesYamlContent}
                  onChange={(value) => {
                    setRulesYamlContent(value || '')
                    setError(null)
                  }}
                />
              </Suspense>
            </div>
  )
}
