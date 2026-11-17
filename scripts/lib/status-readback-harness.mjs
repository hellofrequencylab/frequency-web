// SCAN-1247: run a fallback workflow's status read-back for real, against a fake GitHub.
//
// The three fallbacks POST a commit status and then read it back before they say "verified".
// This lifts the shell between `# read-back:start` and `# read-back:end` out of the workflow
// file and runs it under bash with a stub `curl` and a no-op `sleep` first on PATH, so a probe
// and a test can ask what the step DOES when GitHub's read path is late, never, or broken.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const READBACK_WORKFLOWS = [
  { file: '.github/workflows/db-tests-fallback.yml', context: 'db-tests' },
  { file: '.github/workflows/pr-compare-fallback.yml', context: 'pr-compare' },
  { file: '.github/workflows/migration-readiness-fallback.yml', context: 'migration-readiness' },
]

/** The read-back shell of one workflow, de-indented. Null when the markers are not there. */
function extractReadBack(file, root) {
  const path = join(root, file)
  if (!existsSync(path)) return null
  const lines = readFileSync(path, 'utf8').split('\n')
  const start = lines.findIndex((l) => l.trim() === '# read-back:start')
  const end = lines.findIndex((l) => l.trim() === '# read-back:end')
  if (start < 0 || end <= start) return null
  const indent = lines[start].length - lines[start].trimStart().length
  return lines
    .slice(start + 1, end)
    .map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length)))
    .join('\n')
}

// The stub counts its calls, honours `-o <file>`, and answers from the scenario:
//   SEEN_FROM=n   the context is in the body from the nth call on (0 = never)
//   HTTP_FAIL=1   every call fails the way `curl --fail-with-body` fails on a 4xx (exit 22)
const CURL_STUB = `#!/usr/bin/env bash
n=$(( $(cat "$STUB_DIR/curl.calls" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STUB_DIR/curl.calls"
out=/dev/stdout; url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    http*) url="$1" ;;
  esac
  shift
done
echo "$url" >> "$STUB_DIR/curl.urls"
if [ "\${HTTP_FAIL:-0}" = "1" ]; then
  echo '{"message":"Not Found"}' > "$out"
  exit 22
fi
if [ "\${SEEN_FROM:-0}" -gt 0 ] && [ "$n" -ge "$SEEN_FROM" ]; then
  echo '{"state":"success","statuses":[{"context":"some-other-check","state":"success"},{"context":"'"$CONTEXT"'","state":"success"}]}' > "$out"
else
  echo '{"state":"pending","statuses":[{"context":"some-other-check","state":"success"}]}' > "$out"
fi
`
const SLEEP_STUB = `#!/usr/bin/env bash
echo "$1" >> "$STUB_DIR/sleep.calls"
`

/**
 * Run one workflow's read-back under a scenario.
 * @returns {{ok: false, reason: string} | {ok: true, status: number, output: string, reads: number, slept: number, urls: string[]}}
 */
export function runReadBack({ file, context }, { seenFrom = 0, httpFail = false } = {}, root = process.cwd()) {
  const body = extractReadBack(file, root)
  if (body === null) return { ok: false, reason: `${file} has no # read-back:start / # read-back:end block` }
  const dir = mkdtempSync(join(tmpdir(), 'readback-'))
  try {
    for (const [name, text] of [['curl', CURL_STUB], ['sleep', SLEEP_STUB]]) {
      writeFileSync(join(dir, name), text)
      chmodSync(join(dir, name), 0o755)
    }
    // The step keeps its scratch file in /tmp on the runner. Here it goes in this run's own
    // directory so two runs side by side cannot read each other's body. Nothing else is rewritten.
    const script = [
      'set -uo pipefail',
      'api="${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}"',
      body.replaceAll('/tmp/status.json', join(dir, 'status.json')),
      'echo "READBACK-PASSED"',
    ].join('\n')
    const r = spawnSync('bash', ['-c', script], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        STUB_DIR: dir,
        CONTEXT: context,
        SEEN_FROM: String(seenFrom),
        HTTP_FAIL: httpFail ? '1' : '0',
        GH_TOKEN: 'stub-token',
        HEAD_SHA: '0123456789abcdef0123456789abcdef01234567',
        GITHUB_API_URL: 'https://api.github.invalid',
        GITHUB_REPOSITORY: 'owner/repo',
      },
    })
    const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8').trim() : '')
    return {
      ok: true,
      status: r.status ?? 1,
      output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
      reads: Number(read('curl.calls') || 0),
      slept: read('sleep.calls').split('\n').filter(Boolean).reduce((a, s) => a + Number(s), 0),
      urls: read('curl.urls').split('\n').filter(Boolean),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Every way the read-back contract can be broken for one workflow. Empty means it holds. */
export function readBackFailures(workflow, root = process.cwd()) {
  const late = runReadBack(workflow, { seenFrom: 3 }, root)
  if (!late.ok) return [late.reason]
  const never = runReadBack(workflow, { seenFrom: 0 }, root)
  const broken = runReadBack(workflow, { httpFail: true }, root)
  const loud = /::error::Posted .*context is absent/
  const bad = []
  if (late.status !== 0 || !late.output.includes('READBACK-PASSED'))
    bad.push(`a context that shows on the third read fails the step (exit ${late.status}, ${late.reads} read(s))`)
  if (late.status === 0 && late.reads !== 3)
    bad.push(`passed after ${late.reads} read(s), not at the third: it did not stop when it saw the context`)
  if (never.status === 0 || never.output.includes('READBACK-PASSED')) bad.push('a context that never shows passes the step')
  if (!loud.test(never.output)) bad.push('a context that never shows does not print the loud "context is absent" error')
  if (never.reads < 4 || never.reads > 8) bad.push(`gave up after ${never.reads} read(s); expected about six`)
  if (never.slept >= 60) bad.push(`waits ${never.slept}s in total before giving up; the budget is under a minute`)
  if (broken.status === 0 || broken.output.includes('READBACK-PASSED')) bad.push('a failed HTTP read passes the step')
  if (broken.reads !== 1) bad.push(`polled ${broken.reads} time(s) past a failed HTTP read`)
  if (!late.urls.every((u) => /\/commits\/[0-9a-f]{40}\/status\?per_page=100$/.test(u)))
    bad.push('reads the combined status without per_page=100, so a context past the first 30 is invisible')
  return bad
}
