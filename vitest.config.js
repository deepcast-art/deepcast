import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'server/**/*.test.js', 'tests/unit/**/*.js'],
    passWithNoTests: true,
  },
})
