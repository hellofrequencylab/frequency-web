import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseShellCommands } from '../lib/shell-parse.mjs'

const root = mkdtempSync(join(tmpdir(), 'frequency-parse-control-'))
try {
  const marker = join(root, 'executed')
  const valid = `node -e "console.log($(touch '${marker}'))"`
  const bad = ["node -e '", "'"]
  const errors = parseShellCommands([valid, ...bad])
  assert.equal(errors.get(valid), null)
  for (const command of bad) assert.ok(errors.get(command), 'Separate invalid probes must never close each other’s quotes')
  assert.equal(existsSync(marker), false, 'Parsing must never execute the probe or its substitutions')
  console.log('Shell syntax checks remain independent and never execute commands')
} finally { rmSync(root, { recursive: true, force: true }) }
