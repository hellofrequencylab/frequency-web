import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  isUnguardedAction,
  isRouteFile,
  classifyRoute,
  scanRoutes,
  routeDigest,
  normalizeForDigest,
  loadLedger,
  formatRouteFailure,
  runChecks,
  ROUTE_GATE,
  ROUTE_VERDICTS,
  LEDGER_PATH,
  MIN_ROUTE_FILES,
  MIN_API_ROUTE_FILES,
} from './check-authz-guards.mjs'

// LIVE-022. The point of these tests is NOT "the route scan exists" — a gate that exists and
// never fires is the shape-not-truth failure this repo has been bitten by five times. Every test
// below measures a CONSEQUENCE: that the gate reaches app/api at all, and that it says NO to a
// route handler with no authorization verdict.

// A real, minimal Next 16 Route Handler: a `route.ts` exporting a named HTTP method. No
// `'use server'` anywhere — which is precisely what made these files invisible for so long.
const BARE_ROUTE = `
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const { id, role } = await req.json()
  const admin = createAdminClient()
  await admin.from('profiles').update({ community_role: role }).eq('id', id)
  return NextResponse.json({ ok: true })
}
`

const GATED_ROUTE = `
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: Request) {
  await requireAdmin()
  return NextResponse.json({ ok: true })
}
`

const PUBLIC_ROUTE = `
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ version: 1 })
}
`

const ledgerFor = (file: string, src: string, over: Record<string, unknown> = {}) => ({
  [file]: {
    verdict: 'public',
    reason: 'Fixture route: static JSON, no database, no session, identical for every visitor.',
    checked: '2026-08-17',
    digest: routeDigest(src),
    ...over,
  },
})

describe('the blindness LIVE-022 named', () => {
  it('was a route-SHAPE assumption, not a path glob: the action classifier dismisses a real handler', () => {
    // `isUnguardedAction` opens with `if (!src.includes("'use server'")) return false`. This
    // fixture bypasses RLS with the admin client and updates another member's ROLE with no gate
    // at all — the single worst thing a route can do — and the action scan calls it clean.
    expect(BARE_ROUTE.includes("'use server'")).toBe(false)
    expect(isUnguardedAction('app/api/promote/route.ts', BARE_ROUTE)).toBe(false)
  })

  it('was never a path problem: app/api route files were always inside the walk', () => {
    const { apiRouteCount, routeCount } = runChecks()
    expect(apiRouteCount).toBeGreaterThanOrEqual(MIN_API_ROUTE_FILES)
    expect(routeCount).toBeGreaterThan(apiRouteCount) // handlers live outside app/api too
  })
})

describe('isRouteFile', () => {
  it('matches the Next 16 file convention and nothing else', () => {
    expect(isRouteFile('app/api/search/route.ts')).toBe(true)
    expect(isRouteFile('app/dev/og-root-card/route.tsx')).toBe(true)
    expect(isRouteFile('app/api/status/route.test.ts')).toBe(false)
    expect(isRouteFile('app/(main)/page.tsx')).toBe(false)
    expect(isRouteFile('lib/router/route.ts')).toBe(true) // shape-only; the walk supplies app/ paths
    expect(isRouteFile('app/api/enroute/handler.ts')).toBe(false)
  })
})

describe('classifyRoute — non-vacuity', () => {
  it('FAILS a new API route handler that carries no verdict', () => {
    const r = classifyRoute('app/api/promote/route.ts', BARE_ROUTE, {})
    expect(r.problem).toBe('no-verdict')
    expect(r.source).toBe('none')
  })

  it('passes a route that calls a real gate', () => {
    expect(classifyRoute('app/api/promote/route.ts', GATED_ROUTE, {}).problem).toBeNull()
    expect(classifyRoute('app/api/promote/route.ts', GATED_ROUTE, {}).source).toBe('gate')
  })

  it('passes a route whose verdict is recorded in the ledger, and reports it as ASSERTED not gated', () => {
    const ledger = ledgerFor('app/api/thing/route.ts', PUBLIC_ROUTE)
    const r = classifyRoute('app/api/thing/route.ts', PUBLIC_ROUTE, ledger)
    expect(r.problem).toBeNull()
    expect(r.source).toBe('ledger')
    expect(r.verdict).toBe('public')
  })

  it('FAILS a ledgered route whose code changed after the verdict was recorded', () => {
    // The whole complaint: the 2026-08-04 audit was clean on the day, and nothing caught a bad
    // one tomorrow. This is tomorrow.
    const ledger = ledgerFor('app/api/thing/route.ts', PUBLIC_ROUTE)
    const tampered = PUBLIC_ROUTE.replace('return NextResponse.json({ version: 1 })', 'return NextResponse.json(await secrets())')
    expect(classifyRoute('app/api/thing/route.ts', tampered, ledger).problem).toBe('stale-digest')
  })

  it('does NOT fire on a prose-only edit — the verdict is about the code', () => {
    const ledger = ledgerFor('app/api/thing/route.ts', PUBLIC_ROUTE)
    const recommented = '// A much longer explanation of why this is safe.\n' + PUBLIC_ROUTE + '\n/* trailing note */\n'
    expect(classifyRoute('app/api/thing/route.ts', recommented, ledger).problem).toBeNull()
  })

  it('lets a real gate supersede a ledger entry, as a notice rather than a failure', () => {
    const ledger = ledgerFor('app/api/thing/route.ts', PUBLIC_ROUTE)
    const r = classifyRoute('app/api/thing/route.ts', GATED_ROUTE, ledger)
    expect(r.problem).toBeNull()
    expect(r.redundantLedgerEntry).toBe(true)
  })
})

describe('scanRoutes', () => {
  const read = (files: Record<string, string>) => (f: string) => files[f]

  it('reports the verdict-less route and only that one', () => {
    const files = { 'app/api/a/route.ts': GATED_ROUTE, 'app/api/b/route.ts': BARE_ROUTE }
    const out = scanRoutes(Object.keys(files), {}, read(files))
    expect(out.violations.map((v) => v.file)).toEqual(['app/api/b/route.ts'])
  })

  it('FAILS a ledger entry whose route no longer exists', () => {
    // A verdict left behind would be inherited by whatever is created at that path next.
    const files = { 'app/api/a/route.ts': GATED_ROUTE }
    const out = scanRoutes(Object.keys(files), ledgerFor('app/api/deleted/route.ts', PUBLIC_ROUTE), read(files))
    expect(out.orphans).toEqual(['app/api/deleted/route.ts'])
  })

  it('names the offending file and the fix in its failure text', () => {
    const files = { 'app/api/promote/route.ts': BARE_ROUTE }
    const text = formatRouteFailure(scanRoutes(Object.keys(files), {}, read(files)))
    expect(text).toContain('NO authorization verdict')
    expect(text).toContain('app/api/promote/route.ts')
    expect(text).toContain(LEDGER_PATH)
    expect(text).toContain('--print-digest')
  })
})

describe('ROUTE_GATE', () => {
  it('recognises the HTTP-boundary gates the action scan never needed', () => {
    for (const token of [
      'const denied = rejectUnauthorizedCron(request)',
      'verifyTwilioSignature(body, sig)',
      'verifyResendSignature(payload, headers, secret)',
      'stripe.webhooks.constructEvent(body, sig, SECRET)',
      'const ownerId = await contactsOwnerId()',
      'await requireAdmin()',
      'const { data } = await supabase.auth.getUser()',
    ]) {
      expect(ROUTE_GATE.test(token), token).toBe(true)
    }
  })

  it('is not satisfied by things that are not authorization', () => {
    for (const token of [
      'if (!(await rateLimitOk("help-ask", clientIp(request), 10, "60 s"))) return tooMany()',
      'export const dynamic = "force-dynamic"',
      '// this route is public and safe',
      'const admin = createAdminClient()',
    ]) {
      expect(ROUTE_GATE.test(token), token).toBe(false)
    }
  })
})

describe('normalizeForDigest', () => {
  it('drops comments and blank lines but keeps every line of code', () => {
    const out = normalizeForDigest('// note\nconst a = 1\n\n/* block\n   comment */\nconst b = 2\n')
    expect(out).toBe('const a = 1\nconst b = 2')
  })

  it('does not eat a URL', () => {
    expect(normalizeForDigest("const u = 'https://example.com/x'")).toContain('https://example.com/x')
  })
})

describe('the real tree', () => {
  it('scans every route handler, well past both floors', () => {
    const { routeCount, apiRouteCount } = runChecks()
    expect(routeCount).toBeGreaterThanOrEqual(MIN_ROUTE_FILES)
    expect(apiRouteCount).toBeGreaterThanOrEqual(MIN_API_ROUTE_FILES)
  })

  it('has a verdict for every route handler and no orphaned ledger entries', () => {
    const { routes } = runChecks()
    expect(routes.violations.map((v) => `${v.file} (${v.problem})`)).toEqual([])
    expect(routes.orphans).toEqual([])
  })

  it('keeps the ledger honest: every entry is a real file, a known verdict, and a matching digest', () => {
    const ledger = loadLedger()
    for (const [file, entry] of Object.entries(ledger) as [string, { verdict: string; digest: string }][]) {
      expect(ROUTE_VERDICTS.has(entry.verdict), `${file} verdict`).toBe(true)
      expect(routeDigest(readFileSync(file, 'utf8')), `${file} digest`).toBe(entry.digest)
    }
  })

  it('does not let the ledger swallow the corpus — most routes must earn a verdict from a real gate', () => {
    // The failure mode this guards is the one ADR-970 names: a gate that goes green because
    // everything got asserted. If the assertion ledger ever outgrows the gated set, the route
    // scan has stopped measuring anything.
    const { routes } = runChecks()
    const gated = routes.results.filter((r) => r.source === 'gate').length
    const asserted = routes.results.filter((r) => r.source === 'ledger').length
    expect(asserted).toBeLessThan(gated)
  })
})
