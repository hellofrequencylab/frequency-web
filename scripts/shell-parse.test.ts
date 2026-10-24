import { expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseShellCommands } from './lib/shell-parse.mjs'

it('parses commands without executing substitutions or side effects', () => {
  const root = mkdtempSync(join(tmpdir(), 'shell-no-execute-'))
  try {
    const marker = join(root, 'executed')
    const command = `node -e "console.log($(touch '${marker}'))"`
    expect(parseShellCommands([command]).get(command)).toBeNull()
    expect(existsSync(marker)).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('does not let an unclosed quote in one probe close inside another', () => {
  const commands = ["node -e '", "'", 'node -e "process.exit(0)"']
  const result = parseShellCommands(commands)
  expect(result.get(commands[0])).toBeTruthy()
  expect(result.get(commands[1])).toBeTruthy()
  expect(result.get(commands[2])).toBeNull()
})

it('retains individual syntax verdicts across worker lanes and duplicate commands', () => {
  const commands = Array.from({ length: 19 }, (_, index) => `node -e 'console.log(${index})'`)
  commands[3] = 'node -e "unmatched`"'
  commands[17] = 'node -e "unmatched`"'
  const result = parseShellCommands(commands)
  expect([...result.values()].filter(Boolean)).toHaveLength(1)
  expect(result.get(commands[3])).toMatch(/syntax|unterminated|unexpected EOF/i)
  expect(result.get(commands[18])).toBeNull()
  expect(parseShellCommands([]).size).toBe(0)
})

it('fails closed when the shell parser cannot start', () => {
  vi.stubEnv('PATH', '/frequency-audit-no-parser-here')
  try {
    const command = 'node -e "process.exit(0)"'
    expect(parseShellCommands([command]).get(command)).toMatch(/did not finish/)
  } finally { vi.unstubAllEnvs() }
})
