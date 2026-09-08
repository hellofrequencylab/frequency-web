import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { cronBudget, CRON_CEILING_MS, CRON_TIME_BUDGET_MS } from '@/lib/cron/budget'
import { CRON_CEILING_MS as HEARTBEAT_CEILING_MS } from '@/lib/observability/cron-heartbeat'

// LIVE-190 (ADR-1252). Every cron route declares a per-invocation work budget through
// `lib/cron/budget.ts` and APPLIES it: to the driving query's limit, to an in-memory take, or to the
// clock inside its loop. This test walks the real route files and fails one that only writes the
// budget down. It measures the import, the call, the application and the summary line, not the
// words in a header comment, so a route that says "budget: 200" in prose and reads everything
// still fails here.
//
// ⚠️ BOUNDED_BY_DESIGN is a ratchet, not an allowlist of unbounded routes. A route named here is
// bounded by its own shape (one promotion per run, four bulk statements, a fixed repo corpus) and
// has nothing to pass a limit to; it still declares the budget and logs the summary. The map may
// only shrink: a new route cannot be added without changing FROZEN_BY_DESIGN below, and each entry
// carries the reason a reviewer should re-check.

const CRON_DIR = join(process.cwd(), 'app', 'api', 'cron')

/** Routes below this count mean the walk found the wrong directory, not a smaller repo. */
const MIN_ROUTES = 27

const BOUNDED_BY_DESIGN: Record<string, string> = {
  'embed-help': 'the corpus is content/help in this repo, hash-skipped, and one run always finishes it',
  'enforce-retention': 'four bulk statements per run with no per-row round trip; the database bounds them',
  'season-go-live': 'one promotion per run by the seasons model; the due count it reports is the remainder',
}
const FROZEN_BY_DESIGN = ['embed-help', 'enforce-retention', 'season-go-live'] as const

export function stripComments(src: string): string {
  // Block comments, whole-line `//` comments, and trailing `//` comments that follow whitespace.
  // A URL inside a string keeps its `//` because a colon precedes it, not a space.
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/[ \t]\/\/.*$/gm, '')
}

export interface BudgetShape {
  imports: boolean
  /** The literal N in `cronBudget(N)`, or null when there is no such call. */
  items: number | null
  /** `budget.items`, `budget.take(` or `budget.exhausted` is used somewhere after the call. */
  applies: boolean
  /** `budget.summary(` is called, so the counts line reports processed vs remaining. */
  summarises: boolean
  /** The budget is created inside a function body (indented), never at module scope. */
  insideHandler: boolean
}

/** Pure: the shape of one route file's budget declaration. */
export function assessCronRoute(source: string): BudgetShape {
  const src = stripComments(source)
  const imports = /import\s*\{[^}]*\bcronBudget\b[^}]*\}\s*from\s*['"]@\/lib\/cron\/budget['"]/.test(src)
  const call = /\bcronBudget\(\s*(\d+)\s*[,)]/.exec(src)
  const items = call ? Number(call[1]) : null
  const applies = /\bbudget\.(?:items\b|take\(|exhausted\b)/.test(src)
  const summarises = /\bbudget\.summary\(/.test(src)
  const insideHandler = /^[ \t]+const budget = cronBudget\(/m.test(src) && !/^const budget = cronBudget\(/m.test(src)
  return { imports, items, applies, summarises, insideHandler }
}

/** Pure: the problems with one route's shape, empty when it is bounded. */
export function budgetProblems(name: string, shape: BudgetShape): string[] {
  const out: string[] = []
  if (!shape.imports) out.push('does not import cronBudget from @/lib/cron/budget')
  if (shape.items === null) out.push('never calls cronBudget(N) with a literal batch size')
  else if (shape.items < 1) out.push(`declares a batch size of ${shape.items}`)
  if (!shape.insideHandler) out.push('creates the budget at module scope (the clock would start at import)')
  if (!shape.summarises) out.push('never calls budget.summary(processed, remaining) on its counts line')
  if (!shape.applies && !(name in BOUNDED_BY_DESIGN)) {
    out.push('never applies the budget (budget.items on the driving query, budget.take(rows), or budget.exhausted() in the loop)')
  }
  return out
}

function routeNames(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(CRON_DIR, d.name, 'route.ts')))
    .map((d) => d.name)
    .sort()
}

// ── the module ──────────────────────────────────────────────────────────────────────────────

describe('cronBudget', () => {
  it('states a clock under the platform ceiling, and the ceiling the heartbeat seam uses', () => {
    expect(CRON_TIME_BUDGET_MS).toBeLessThan(CRON_CEILING_MS)
    expect(CRON_CEILING_MS).toBe(HEARTBEAT_CEILING_MS)
  })

  it('refuses a non-positive batch and a clock at or past the ceiling', () => {
    expect(() => cronBudget(0)).toThrow(/positive integer/)
    expect(() => cronBudget(1.5)).toThrow(/positive integer/)
    expect(() => cronBudget(10, { timeMs: CRON_CEILING_MS })).toThrow(/between 1 and/)
  })

  it('take splits rows into the batch and the counted remainder', () => {
    const b = cronBudget(2)
    expect(b.take(['a', 'b', 'c', 'd'])).toEqual({ batch: ['a', 'b'], remaining: 2 })
    expect(b.take(['a'])).toEqual({ batch: ['a'], remaining: 0 })
    expect(b.take([])).toEqual({ batch: [], remaining: 0 })
  })

  it('exhausted latches once the clock is spent, and the summary reports it', () => {
    let t = 1_000
    const b = cronBudget(5, { timeMs: 100, now: () => t })
    expect(b.exhausted()).toBe(false)
    expect(b.summary(3, 0).stopped_on_time).toBe(false)
    t = 1_100
    expect(b.exhausted()).toBe(true)
    t = 1_050 // a clock that goes backwards does not un-trip it
    expect(b.exhausted()).toBe(true)
    const s = b.summary(3, 4)
    expect(s).toMatchObject({ processed: 3, remaining: 4, more: true, budget_items: 5, budget_ms: 100, stopped_on_time: true })
    expect(s.elapsed_ms).toBeGreaterThanOrEqual(0)
  })

  it('summary infers "more" from a full batch when the remainder cannot be counted', () => {
    const b = cronBudget(3)
    expect(b.summary(3).more).toBe(true)
    expect(b.summary(2).more).toBe(false)
    expect(b.summary(3, 0).more).toBe(false)
    expect(b.summary(1, 9).more).toBe(true)
    expect(b.summary(1, null).remaining).toBeNull()
  })
})

// ── the source shape ─────────────────────────────────────────────────────────────────────────

const BOUNDED = `
import { NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
async function handler() {
  const budget = cronBudget(200)
  const result = await run(budget.items)
  return NextResponse.json({ ok: true, budget: budget.summary(result.processed) })
}
export const GET = withCronHeartbeat('x', handler)
`

describe('assessCronRoute (positive controls)', () => {
  it('passes a route that imports, calls, applies and summarises', () => {
    expect(budgetProblems('x', assessCronRoute(BOUNDED))).toEqual([])
  })

  it('fails a route with no budget at all', () => {
    const src = BOUNDED.replace(/import \{ cronBudget \}.*\n/, '').replace(/  const budget = .*\n/, '')
      .replace('run(budget.items)', 'run()').replace(', budget: budget.summary(result.processed)', '')
    const problems = budgetProblems('x', assessCronRoute(src))
    expect(problems).toContain('does not import cronBudget from @/lib/cron/budget')
    expect(problems).toContain('never calls cronBudget(N) with a literal batch size')
  })

  it('fails a route that only writes the budget down: a call with no application', () => {
    const src = BOUNDED.replace('run(budget.items)', 'run()')
    expect(budgetProblems('x', assessCronRoute(src))).toEqual([
      'never applies the budget (budget.items on the driving query, budget.take(rows), or budget.exhausted() in the loop)',
    ])
  })

  it('fails a route whose budget lives in a comment', () => {
    const src = BOUNDED.replace('  const budget = cronBudget(200)', '  // const budget = cronBudget(200)')
      .replace('run(budget.items)', 'run() // budget.items').replace(', budget: budget.summary(result.processed)', '')
    const problems = budgetProblems('x', assessCronRoute(src))
    expect(problems).toContain('never calls cronBudget(N) with a literal batch size')
    expect(problems.some((p) => p.startsWith('never applies'))).toBe(true)
  })

  it('fails a route that creates the budget at module scope', () => {
    const src = BOUNDED.replace('  const budget = cronBudget(200)\n', '').replace(
      "import { cronBudget } from '@/lib/cron/budget'\n",
      "import { cronBudget } from '@/lib/cron/budget'\nconst budget = cronBudget(200)\n",
    )
    expect(budgetProblems('x', assessCronRoute(src))).toContain(
      'creates the budget at module scope (the clock would start at import)',
    )
  })

  it('fails a route with no summary line', () => {
    const src = BOUNDED.replace(', budget: budget.summary(result.processed)', '')
    expect(budgetProblems('x', assessCronRoute(src))).toEqual([
      'never calls budget.summary(processed, remaining) on its counts line',
    ])
  })

  it('exempts only a BOUNDED_BY_DESIGN route from the application check, and nothing else', () => {
    const src = BOUNDED.replace('run(budget.items)', 'run()')
    expect(budgetProblems('season-go-live', assessCronRoute(src))).toEqual([])
    expect(budgetProblems('process-queue', assessCronRoute(src))).toHaveLength(1)
  })
})

describe('every cron route declares and applies a per-invocation budget (LIVE-190)', () => {
  const names = routeNames()

  it(`walks the real cron tree (${names.length} routes, floor ${MIN_ROUTES})`, () => {
    expect(names.length).toBeGreaterThanOrEqual(MIN_ROUTES)
  })

  it('BOUNDED_BY_DESIGN is frozen: it may shrink, never grow, and names only real routes', () => {
    for (const name of Object.keys(BOUNDED_BY_DESIGN)) {
      expect(FROZEN_BY_DESIGN).toContain(name)
      expect(names).toContain(name)
    }
  })

  for (const name of names) {
    it(`${name} is bounded`, () => {
      const shape = assessCronRoute(readFileSync(join(CRON_DIR, name, 'route.ts'), 'utf8'))
      expect(budgetProblems(name, shape)).toEqual([])
    })
  }
})
