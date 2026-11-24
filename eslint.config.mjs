import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  { ...eslint.configs.recommended, files: ['**/*.ts', '**/*.tsx'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
]
