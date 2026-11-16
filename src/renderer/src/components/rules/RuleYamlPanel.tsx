import { lazy, Suspense, useState } from 'react'

import { LoaderCircle } from 'lucide-react'

import type { RuleEditorState } from '../../hooks/useRuleEditor'

const YamlEditor = lazy(() => import('../YamlEditor'))

export interface RuleYamlPanelProps {
  editor: Pick<RuleEditorState, 'rulesYamlRef' | 'setError' | 'isDark'>

}

export function RuleYamlPanel({ editor }: RuleYamlPanelProps) {
  const { rulesYamlRef, setError, isDark } = editor
  const [content, setContent] = useState(() => rulesYamlRef.current)

  return (
<div className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-background flex flex-col">
              <Suspense fallback={<div role="status" className="flex h-full items-center justify-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div>}>
                <YamlEditor
                  theme={isDark ? 'vs-dark' : 'light'}
                  value={content}
                  onChange={(value) => {
                    const text = value || ''
                    rulesYamlRef.current = text
                    setContent(text)
                    setError(null)
                  }}
                />
              </Suspense>
            </div>
  )
}
