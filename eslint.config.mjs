// ESLint flat config para Next.js 16 + React + TypeScript (App Router)
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '**/.next/**',
    '**/.next-*/**',
    '**/.open-next/**',
    '**/.market-admin/**',
    '**/_tmp/**',
    '**/node_modules/**',
    '**/public/**',
    '**/next-env.d.ts',
  ]),
])
