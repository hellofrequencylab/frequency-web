import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkCrmParity, surfaceFloorFailure, SURFACES } from './check-crm-parity.mjs'

// Locks the CRM / comms parity contract (ADR-817, docs/CRM-COMMS-CONTRACT.md) inside the test suite.
// checkCrmParity() reads the real repo (resolving paths from the script's own location, so it's
// cwd-independent), which is exactly the drift we want to catch.
//
// ⚠️ 2026-08-12: this file is now the ENFORCEMENT. `check:crm-parity` left the CI guards array —
// vitest AUTO-DISCOVERS `*.test.ts`, so unlike an array entry this cannot be forgotten, which is how
// check:studio came to enforce nothing for the whole life of PR #2098. `node
// scripts/check-crm-parity.mjs` still prints the friendly report.
describe('check-crm-parity (CRM / comms parity contract)', () => {
  it('refuses to measure a corpus it could not read (the non-triviality floor)', () => {
    // 🔴 MEASURED 2026-08-12: run with cwd set to an empty directory, this guard printed
    // "✓ Vera + branded send + signature + batching are single-source" and exited 0. The floor
    // lived only in the CLI block; asserting it here is what keeps it once CI stopped running the
    // CLI. "No surface read" and "every surface correct" must not produce the same verdict.
    expect(surfaceFloorFailure()).toBeNull()
    expect(SURFACES.length).toBeGreaterThanOrEqual(3)
  })

  it('every CRM surface routes through the shared comms modules; no re-inlined logic', () => {
    const { violations } = checkCrmParity()
    // A non-empty list means a surface forked its own copy — the message names the file + the fix.
    expect(violations, `\n${violations.join('\n')}\n`).toEqual([])
  })
})

// ── THE NEGATIVE CONTROL (scan2 L8-03, 2026-09-05) ──────────────────────────────────────────
// The two tests above prove the live tree is clean and the floor is real. Neither proves the
// DETECTOR still matches anything: a surface that dropped a shared import is caught only if
// `importsAll` still parses today's import syntax, and a re-inlined prompt only if the sentinel walk
// still reads the tree. `checkCrmParity(root)` now takes the tree to measure, so the same detector
// runs here against a fixture whose surfaces use the live import syntax (single-line and multi-line
// `import { a, b } from '@/lib/comms/…'` blocks, `type` specifiers, an `as` rename) with one planted
// violation per arm.

const ADMIN = 'app/(main)/admin/crm/conversations/actions.ts'
const SPACE = 'app/(main)/spaces/[slug]/crm/conversations-actions.ts'
const LEAD = 'app/(main)/lead/inbox/actions.ts'

const DRAFT_PROMPT = 'You draft a reply to a member on behalf of a Frequency team member.'

function surface({ compose, emailTemplate = true, multiline = false }: { compose: boolean; emailTemplate?: boolean; multiline?: boolean }): string {
  const vera = multiline
    ? "import {\n  veraDraftReply,\n  veraSummarize as summarize,\n  veraSuggestTriage,\n  type VeraDraft,\n} from '@/lib/comms/vera-conversation'\n"
    : "import { veraDraftReply, veraSummarize, veraSuggestTriage } from '@/lib/comms/vera-conversation'\n"
  return (
    "'use server'\n" +
    vera +
    (emailTemplate ? "import { renderReplyEmail } from '@/lib/comms/email-template'\n" : '') +
    "import { resolveSignature } from '@/lib/comms/signature'\n" +
    "import { conversationBatchWindowMinutes, queueOutboundMessage } from '@/lib/comms/outbound-batch'\n" +
    (compose ? "import { startConversationMessage } from '@/lib/comms/conversation-compose'\n" : '') +
    'export async function noop() {}\n'
  )
}

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

function makeCrmTree(planted: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-parity-'))
  fixtures.push(dir)
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  write(ADMIN, surface({ compose: true, multiline: true }))
  write(SPACE, surface({ compose: true }))
  write(LEAD, surface({ compose: false, emailTemplate: !planted }))
  write(
    'lib/comms/vera-conversation.ts',
    `export const DRAFT = '${DRAFT_PROMPT}'\n` +
      "export const SUMMARY = 'You summarize a support/CRM conversation.'\n" +
      `export const TRIAGE = "You classify a conversation's priority."\n`,
  )
  write('lib/comms/conversation-compose.ts', '// sentinel:conversation-compose-pipeline\nexport async function startConversationMessage() {}\n')
  if (planted) write('components/crm/fork.tsx', `const PROMPT = '${DRAFT_PROMPT}'\nexport { PROMPT }\n`)
  return dir
}

describe('check-crm-parity · the detector fires on a planted violation (negative control)', () => {
  it('a surface that dropped a shared import, and a re-inlined prompt, are both named', () => {
    const root = makeCrmTree(true)
    expect(surfaceFloorFailure(root)).toBeNull()
    const { violations } = checkCrmParity(root)
    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain(LEAD)
    expect(violations[0]).toContain("must import  { renderReplyEmail } from '@/lib/comms/email-template'")
    expect(violations[1]).toContain('Vera draft prompt: found OUTSIDE the shared module (lib/comms/vera-conversation.ts)')
    expect(violations[1]).toContain('components/crm/fork.tsx')
  })

  it('the same tree with the plants removed is clean, so multi-line, aliased and type-specifier imports all parse', () => {
    const root = makeCrmTree(false)
    expect(surfaceFloorFailure(root)).toBeNull()
    expect(checkCrmParity(root).violations).toEqual([])
  })

  it('a missing surface is a floor failure, and checkCrmParity names it too', () => {
    const root = makeCrmTree(false)
    rmSync(path.join(root, LEAD))
    expect(surfaceFloorFailure(root)).toMatch(/surfaces missing:  1/)
    expect(checkCrmParity(root).violations[0]).toContain(`Surface not found (did a path change? update SURFACES): ${LEAD}`)
  })
})
