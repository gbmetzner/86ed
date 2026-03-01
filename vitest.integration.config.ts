import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    fileParallelism: false,
    env: (() => {
      // Load .env.local so UPSTASH_* vars are available in integration tests
      const fs = require('fs')
      const envFile = '.env.local'
      if (!fs.existsSync(envFile)) return {}
      return Object.fromEntries(
        fs.readFileSync(envFile, 'utf-8')
          .split('\n')
          .filter((l: string) => l && !l.startsWith('#'))
          .map((l: string) => l.replace(/^(\w+)=["']?(.+?)["']?\s*$/, '$1\t$2').split('\t')),
      )
    })(),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
