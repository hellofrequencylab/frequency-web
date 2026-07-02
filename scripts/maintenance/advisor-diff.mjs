#!/usr/bin/env node
// advisor-diff — the STATEFUL half of the scheduled maintenance sweep (docs/MAINTENANCE-AUTOMATION.md
// Phase 2). Takes a Supabase advisor payload (security and/or performance, as fetched by CI with a
// SUPABASE_ACCESS_TOKEN) and the accepted-risk allowlist, and returns only the NEW findings — the
// ones not consciously accepted. This is what keeps the weekly sweep quiet-by-default: it never
// re-reports the ~196 by-design advisories, so a genuinely new WARN/ERROR stands out instead of
// drowning. Exit 1 when there is a new WARN/ERROR (so the workflow opens an issue); new INFO is
// reported but non-fatal.
//
// Usage: node scripts/maintenance/advisor-diff.mjs <advisors.json> [more.json ...]
// Each file is a get_advisors payload (or an array of lints). No DB access here — the fetch is a
// separate, token-gated CI step; this consumes its output.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Robustly locate the lints array in a get_advisors payload (it has been seen wrapped a few ways). */
export function findLints(payload) {
  if (Array.isArray(payload)) return payload[0]?.name ? payload : []
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.lints)) return payload.lints
    for (const v of Object.values(payload)) {
      const found = findLints(v)
      if (found.length) return found
    }
  }
  return []
}

/** The object/table an advisory points at, however the payload spells it. */
function targetOf(lint) {
  return lint.metadata?.name ?? lint.metadata?.entity ?? lint.target ?? null
}

/**
 * PURE diff (testable): given one or more advisor payloads and the accepted-risk allowlist,
 * return the fresh (non-accepted) lints grouped by level.
 */
export function diffAdvisors(payloads, accepted) {
  const acceptedByName = accepted.acceptedByName ?? {}
  const acceptedByTarget = accepted.acceptedByTarget ?? {}
  const lints = payloads.flatMap(findLints)

  const isAccepted = (l) => {
    if (l.name in acceptedByName) return true
    const targets = acceptedByTarget[l.name]
    if (targets) {
      const t = targetOf(l)
      if (t && targets.includes(t)) return true
    }
    return false
  }

  const fresh = lints.filter((l) => !isAccepted(l))
  const level = (l) => (l.level ?? 'INFO').toUpperCase()
  const byLevel = { ERROR: [], WARN: [], INFO: [] }
  for (const l of fresh) (byLevel[level(l)] ??= []).push(l)

  return {
    totalLints: lints.length,
    accepted: lints.length - fresh.length,
    fresh,
    byLevel,
    hasBlocking: (byLevel.ERROR?.length ?? 0) + (byLevel.WARN?.length ?? 0) > 0,
  }
}

/** A short, dedup-by-(name) markdown report for an issue body or the CI log. */
export function formatReport(diff) {
  if (!diff.fresh.length) {
    return `✓ No new Supabase advisories. (${diff.accepted}/${diff.totalLints} accepted by allowlist.)`
  }
  const lines = [`⚠️ ${diff.fresh.length} new Supabase advisory finding(s) not on the accepted-risk allowlist:\n`]
  for (const lvl of ['ERROR', 'WARN', 'INFO']) {
    const group = diff.byLevel[lvl] ?? []
    if (!group.length) continue
    const byName = new Map()
    for (const l of group) byName.set(l.name, (byName.get(l.name) ?? 0) + 1)
    lines.push(`**${lvl}**`)
    for (const [name, n] of byName) lines.push(`- \`${name}\` × ${n}`)
    lines.push('')
  }
  lines.push('_Fix it, or (if it is a conscious trade-off) add it to `scripts/maintenance/accepted-advisories.json` with a rationale + ADR ref._')
  return lines.join('\n')
}

function main() {
  const files = process.argv.slice(2)
  if (!files.length) {
    console.error('usage: advisor-diff.mjs <advisors.json> [more.json ...]')
    process.exit(2)
  }
  const accepted = JSON.parse(readFileSync(join('scripts', 'maintenance', 'accepted-advisories.json'), 'utf8'))
  const payloads = files.map((f) => JSON.parse(readFileSync(f, 'utf8')))
  const diff = diffAdvisors(payloads, accepted)
  console.log(formatReport(diff))
  if (diff.hasBlocking) process.exit(1)
}

import { pathToFileURL } from 'node:url'
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
