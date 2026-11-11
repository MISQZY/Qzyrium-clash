import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default defineConfig(
  { ignores: ['node_modules/**', '.pnpm-store/**', 'out/**', 'dist/**', 'release/**', 'artifacts/**', 'extra/**'] },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' }
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Existing IPC and configuration boundaries intentionally accept dynamic data.
      '@typescript-eslint/no-explicit-any': 'off',
      // Several view components retain optional props and shared UI imports.
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } }
)
