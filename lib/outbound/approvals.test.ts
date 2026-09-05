import { describe, it, expect } from 'vitest'
import {
  APPROVAL_STATUSES,
  SENDABLE_STATUSES,
  isSendable,
  groupReadyByPhase,
  type ApprovalStatus,
  type OutboundItem,
} from './approvals'

// The approval spine's PURE core: the send-gate rule + the phase grouping. The
// governing rule ("nothing sends without approval") is a truth table here, so a
// regression that widens what may send fails the build. DB-backed transitions
// (approve/pause/etc.) are gated + audited in approvals.ts; this locks the policy.
//
// isSendable is what assertApproved branches on, and assertApproved is the one
// check standing between a drafted campaign and a real send, so these four cases
// are the whole rule stated as data.

describe('isSendable — the send gate', () => {
  it('clears ONLY approved and scheduled', () => {
    const sendable = APPROVAL_STATUSES.filter((s) => isSendable(s))
    expect(sendable.sort()).toEqual(['approved', 'scheduled'])
  })

  it('refuses every pre-approval and terminal/brake state', () => {
    for (const s of ['draft', 'ready', 'sending', 'sent', 'paused', 'cancelled'] as ApprovalStatus[]) {
      expect(isSendable(s)).toBe(false)
    }
  })

  it('fail-closed on unknown / null / undefined', () => {
    expect(isSendable(null)).toBe(false)
    expect(isSendable(undefined)).toBe(false)
    expect(isSendable('bogus')).toBe(false)
  })

  it('SENDABLE_STATUSES matches the predicate', () => {
    expect([...SENDABLE_STATUSES].sort()).toEqual(['approved', 'scheduled'])
  })
})

describe('groupReadyByPhase', () => {
  const item = (id: string, phaseId: string | null): OutboundItem => ({
    type: 'campaign',
    id,
    label: id,
    approvalStatus: 'ready',
    phaseId,
    segment: null,
    count: null,
    scheduledFor: null,
    createdAt: null,
  })

  it('buckets items by phase id, with null for the unfiled bucket', () => {
    const groups = groupReadyByPhase([item('a', 'p1'), item('b', 'p1'), item('c', 'p2'), item('d', null)])
    expect(groups.get('p1')?.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups.get('p2')?.map((i) => i.id)).toEqual(['c'])
    expect(groups.get(null)?.map((i) => i.id)).toEqual(['d'])
  })

  it('returns an empty map for no items', () => {
    expect(groupReadyByPhase([]).size).toBe(0)
  })
})

// ── Every key the spine writes to `campaigns` must be a real column. ────────────
//
// L1-01 (2026-09-04, reproduced live): every transition here wrote `updated_at`,
// and `campaigns` has no such column. PostgREST rejects the WHOLE update (PGRST204),
// so markReady / approve / pause / cancel / armPhase never committed and twelve live
// campaigns sat in `draft`. The compiler never saw it because the spine reaches its
// tables through the deliberately untyped builder in ./db.ts (a dynamic table name
// cannot typecheck against the generated client — see that file's header).
//
// So this test is the type check the builder gave up: it reads approvals.ts as
// TEXT, pulls every literal key written by `.update({...})` / `.insert({...})` —
// following an identifier argument (`.update(patch)`) back to its object literal
// and any later `patch.key = ...` assignment — and asserts each one is a column of
// `Database['public']['Tables']['campaigns']['Row']`. The column list is held from
// BOTH sides: the hand list below is `satisfies`-checked against the generated type
// (tsc catches a stale list) and, at runtime, parsed straight out of the Row block
// in lib/database.types.ts (vitest catches it with no typecheck in the loop).
//
// Positive control: the parser must find every write site it is guarding, so a
// regex that goes blind fails loudly instead of passing by finding nothing.

import { readFileSync } from 'node:fs'
import type { Database } from '@/lib/database.types'

type CampaignRow = Database['public']['Tables']['campaigns']['Row']

/** Hand list, pinned to the generated type. Adding a column to the DB types without
 *  adding it here fails `tsc` (via `_exhaustive`); a typo here fails `satisfies`. */
const CAMPAIGN_COLUMNS = [
  'approval_status',
  'approved_at',
  'approved_by',
  'audience_filter',
  'block_json',
  'body',
  'compiled_html',
  'created_at',
  'created_by',
  'from_address',
  'from_name',
  'id',
  'phase_id',
  'preheader',
  'recipient_count',
  'reply_mode',
  'scheduled_for',
  'segment',
  'sent_at',
  'space_id',
  'status',
  'subject',
  'test_sent_at',
  'topic',
] as const satisfies readonly (keyof CampaignRow)[]
type MissingFromHandList = Exclude<keyof CampaignRow, (typeof CAMPAIGN_COLUMNS)[number]>
const _exhaustive: [MissingFromHandList] extends [never] ? true : never = true
void _exhaustive

const approvalsSource = readFileSync(new URL('./approvals.ts', import.meta.url), 'utf8')
const dbTypesSource = readFileSync(new URL('../database.types.ts', import.meta.url), 'utf8')

/** The column names of `campaigns.Row`, read straight from the generated types file. */
function campaignRowColumnsFromTypes(src: string): string[] {
  const head = src.indexOf('\n      campaigns: {\n        Row: {\n')
  if (head < 0) throw new Error('campaigns.Row block not found in lib/database.types.ts')
  const start = src.indexOf('Row: {', head) + 'Row: {'.length
  const end = src.indexOf('\n        }', start)
  return [...src.slice(start, end).matchAll(/^\s+([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map((m) => m[1])
}

/** Balanced slice starting at `open` (a `(`, `{` or `[`), string-aware. Returns the inside. */
function balanced(src: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' }
  const close = pairs[src[open]]
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c in pairs) depth++
    else if (c === pairs[src[open]] || c === ')' || c === '}' || c === ']') {
      depth--
      if (depth === 0 && c === close) return src.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced ${src[open]} at ${open}`)
}

/** Top-level keys of an object-literal body (the text between its braces). */
function literalKeys(body: string): string[] {
  const entries: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quote) {
      cur += c
      if (c === '\\') cur += body[++i]
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if ('({['.includes(c)) depth++
    else if (')}]'.includes(c)) depth--
    if (c === ',' && depth === 0) {
      entries.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  entries.push(cur)
  return entries
    .map((e) => e.trim())
    .filter((e) => e && !e.startsWith('...'))
    .map((e) => {
      const m = e.match(/^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?::|$)/)
      if (!m) throw new Error(`cannot read key from entry: ${e}`)
      return m[1] ?? m[2] ?? m[3]
    })
}

interface WriteSite {
  line: number
  verb: 'update' | 'insert'
  keys: string[]
}

/** Every `.update(...)` / `.insert(...)` in the source, with the literal keys it writes. */
function writeSites(src: string): WriteSite[] {
  const out: WriteSite[] = []
  for (const m of src.matchAll(/\.(update|insert)\(/g)) {
    const verb = m[1] as WriteSite['verb']
    const argStart = m.index + m[0].length - 1
    const arg = balanced(src, argStart).trim()
    const line = src.slice(0, m.index).split('\n').length
    let keys: string[]
    if (arg.startsWith('{')) {
      keys = literalKeys(balanced(arg, 0))
    } else if (arg.startsWith('[')) {
      const inner = balanced(arg, 0)
      keys = [...inner.matchAll(/\{/g)].flatMap((b) => literalKeys(balanced(inner, b.index)))
    } else if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
      // `.update(patch)`: find `const patch[: T] = {` and any `patch.key =` after it.
      const decl = src.match(new RegExp(`(?:const|let)\\s+${arg}\\b[^=]*=\\s*\\{`))
      if (!decl || decl.index === undefined) throw new Error(`no object literal found for ${arg}`)
      keys = literalKeys(balanced(src, decl.index + decl[0].length - 1))
      for (const a of src.matchAll(new RegExp(`\\b${arg}\\s*(?:\\.([A-Za-z_$][\\w$]*)|\\[\\s*'([^']+)'\\s*\\])\\s*=[^=]`, 'g'))) {
        keys.push(a[1] ?? a[2])
      }
    } else {
      throw new Error(`unrecognised ${verb} argument at line ${line}: ${arg}`)
    }
    out.push({ line, verb, keys })
  }
  return out
}

describe('approvals.ts writes only real campaigns columns (L1-01)', () => {
  const columns = campaignRowColumnsFromTypes(dbTypesSource)
  const sites = writeSites(approvalsSource)

  it('the hand list and the generated Row block agree (both directions)', () => {
    expect([...columns].sort()).toEqual([...CAMPAIGN_COLUMNS].sort())
  })

  it('every table the spine writes to is campaigns (extend this test when a second joins)', () => {
    const tables = [...approvalsSource.matchAll(/\.from\(([^)]*)\)/g)].map((m) => m[1].trim())
    expect(tables.length).toBeGreaterThan(0)
    for (const t of tables) expect(t === "'campaigns'" || /^TABLE\[/.test(t)).toBe(true)
    // TABLE maps every ApprovableType to a table name; today that is only campaigns.
    const tableMap = approvalsSource.match(/const TABLE[^=]*=\s*\{/)
    expect(tableMap?.index).toBeDefined()
    const values = literalKeys(balanced(approvalsSource, tableMap!.index! + tableMap![0].length - 1))
    expect(values).toEqual(['campaign'])
    expect(approvalsSource).toMatch(/campaign:\s*'campaigns'/)
  })

  it('positive control: the parser sees every transition write', () => {
    // markReady, approve (via `patch`), pause, cancel, recordTestSend, armPhase.
    expect(sites.length).toBeGreaterThanOrEqual(6)
    const written = new Set(sites.flatMap((s) => s.keys))
    expect(written.has('approval_status')).toBe(true)
    expect(written.has('approved_by')).toBe(true)
    expect(written.has('scheduled_for')).toBe(true) // only reachable via `patch.scheduled_for =`
    expect(written.has('test_sent_at')).toBe(true)
  })

  it('every literal key written by .update()/.insert() is a campaigns column', () => {
    const known = new Set(columns)
    const phantom = sites.flatMap((s) =>
      s.keys.filter((k) => !known.has(k)).map((k) => `${k} (.${s.verb} at approvals.ts:${s.line})`),
    )
    expect(phantom, 'keys written that are not columns of campaigns — PostgREST rejects the whole write (PGRST204)').toEqual([])
  })

  it('the parser reads shorthand, quoted and spread entries without inventing keys', () => {
    expect(literalKeys(`a: 1, 'b-c': "x, y", d, ...rest, e: { f: 1 }, g: fn(1, 2)`)).toEqual(['a', 'b-c', 'd', 'e', 'g'])
  })
})
