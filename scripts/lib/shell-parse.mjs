import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Each command still gets its own `sh -n`: quotes can never close across probes.
// Fork the parsers from small shell workers instead of repeatedly copying a large
// Vitest/Node parent. Eight lanes match the existing backlog probe concurrency.
// No command is executed. Missing or interrupted parsers fail closed.
export function parseShellCommands(commands) {
  const unique = [...new Set(commands)]
  const errors = new Map()
  if (!unique.length) return errors
  const root = mkdtempSync(join(tmpdir(), 'frequency-shell-parse-'))
  const lanes = Math.min(8, unique.length)
  try {
    for (let lane = 0; lane < lanes; lane++) mkdirSync(join(root, String(lane)))
    const paths = unique.map((command, index) => {
      const file = join(root, String(index % lanes), `${index}.sh`)
      writeFileSync(file, command, { mode: 0o600 })
      return file
    })
    const parsed = spawnSync('sh', ['-c',
      'for lane in "$1"/*; do ( for file in "$lane"/*.sh; do sh -n "$file" 2>"$file.err"; printf "%s\\n" "$?" >"$file.status"; done ) & done; wait',
      'frequency-shell-parse', root,
    ], { encoding: 'utf8', timeout: 120_000 })
    for (let index = 0; index < unique.length; index++) {
      let error = null
      if (parsed.error || parsed.signal || parsed.status !== 0) error = 'shell parser did not finish'
      else {
        try {
          const status = readFileSync(paths[index] + '.status', 'utf8').trim()
          if (status !== '0') error = readFileSync(paths[index] + '.err', 'utf8').trim().split('\n')[0] || `shell parser exited ${status}`
        } catch { error = 'shell parser produced no verdict' }
      }
      errors.set(unique[index], error)
    }
    return errors
  } finally { rmSync(root, { recursive: true, force: true }) }
}
