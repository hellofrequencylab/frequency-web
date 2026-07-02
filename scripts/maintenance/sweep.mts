// AI triage step of the scheduled maintenance sweep (docs/MAINTENANCE-AUTOMATION.md Phase 4).
// Reads the deterministic findings the earlier workflow steps wrote (audit.txt from `pnpm audit`,
// advisors.txt from the stateful advisor diff) and — WHEN the Anthropic gateway is configured
// (ANTHROPIC_API_KEY) — asks the model to TRIAGE them into a short, prioritized, actionable
// summary. Writes triage.md for the issue step to fold in. It ADVISES; it never edits code or
// opens PRs autonomously (that stays a human-approved / draft-and-approve action).
//
// Mirrors scripts/help-autodoc.mts: same client seam (lib/ai/client.ts only imports the SDK, so
// it resolves under --experimental-strip-types) and the same messages.create shape. Runs in
// .github/workflows/maintenance.yml. Fail-safe: any error is non-fatal (the deterministic report
// still ships).

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getAnthropic, aiEnabled } from '../../lib/ai/client.ts'
import { MODELS } from '../../lib/ai/models.ts'

const read = (f: string): string => {
  try {
    return readFileSync(f, 'utf8').trim()
  } catch {
    return ''
  }
}

/** PURE prompt builder (unit-testable): compose the triage system + user messages from the findings. */
export function buildTriageMessages(audit: string, advisors: string): {
  system: string
  messages: Array<{ role: 'user'; content: string }>
} {
  const system = [
    'You are the maintenance-triage assistant for Frequency, a Next.js + Supabase web platform.',
    'You receive the raw output of an automated weekly sweep: a dependency audit and a Supabase',
    'advisor diff that ALREADY filtered out the accepted-by-design findings. Produce a SHORT,',
    'prioritized, actionable triage in Markdown:',
    '- Lead with the single most important item.',
    '- Per finding: a severity marker (🔴 / ⚠️ / 🟡), one line on what it is and why it matters,',
    '  and the smallest safe next step (a specific fix, or "accept + add to',
    '  scripts/maintenance/accepted-advisories.json with a rationale").',
    '- Do NOT invent findings that are not in the input. If nothing is actionable, say so in one line.',
    '- No preamble, plain sentences, no em dashes.',
  ].join('\n')
  const user = [
    'Dependency audit output:',
    audit || '(clean)',
    '',
    'Supabase advisor diff (new, non-accepted findings):',
    advisors || '(none / not run this cycle)',
  ].join('\n')
  return { system, messages: [{ role: 'user', content: user }] }
}

async function main() {
  const audit = read('audit.txt')
  const advisors = read('advisors.txt')
  if (!audit && !advisors) {
    console.log('No findings to triage.')
    return
  }
  if (!aiEnabled()) {
    console.log('AI disabled (no ANTHROPIC_API_KEY) — skipping triage; the deterministic report still ships.')
    return
  }
  const client = getAnthropic()
  if (!client) return
  const { system, messages } = buildTriageMessages(audit, advisors)
  try {
    const res = await client.messages.create({ model: MODELS.sonnet, max_tokens: 1000, system, messages })
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
    if (text) {
      writeFileSync('triage.md', text)
      console.log(text)
    }
  } catch (e) {
    console.error('Triage model call failed (non-fatal):', e)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e)
    process.exit(0) // never fail the sweep on a triage error
  })
}
