/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

test('native components keep fixed paint values in the Frequency token source', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const violations: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') && path !== join(root, 'theme/tokens.ts')) {
        if (/(?:['"`]#[\da-f]{3,8}\b|rgba?\(\s*\d)/i.test(readFileSync(path, 'utf8'))) violations.push(path.slice(root.length))
      }
    }
  }
  walk(root)
  assert.deepEqual(violations, [], 'Paint literals belong in theme/tokens.ts; computed device RGB values remain allowed')
})
