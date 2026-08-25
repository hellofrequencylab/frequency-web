import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  classifyActionFile,
  actionExports,
  actionAnnotations,
  scanActions,
  ACTION_GATE,
  MIN_ACTION_FILES,
  MIN_ACTION_EXPORTS,
  isRouteFile,
  classifyRoute,
  scanRoutes,
  routeDigest,
  normalizeForDigest,
  loadLedger,
  formatRouteFailure,
  runChecks,
  gateSoundness,
  handlerExports,
  maskLiterals,
  ROUTE_GATE,
  ROUTE_VERDICTS,
  LEDGER_PATH,
  MIN_ROUTE_FILES,
  MIN_API_ROUTE_FILES,
} from './check-authz-guards.mjs'

type RouteResult = {
  file: string
  source: 'gate' | 'ledger' | 'none'
  verdict: string | null
  problem: string | null
  redundantLedgerEntry?: boolean
}

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
    // The action classifier opens with `if (!src.includes("'use server'")) return null`. This
    // fixture bypasses RLS with the admin client and updates another member's ROLE with no gate
    // at all — the single worst thing a route can do — and the action scan calls it clean.
    expect(BARE_ROUTE.includes("'use server'")).toBe(false)
    expect(classifyActionFile('app/api/promote/route.ts', BARE_ROUTE)).toBeNull()
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
    expect(out.violations.map((v: RouteResult) => v.file)).toEqual(['app/api/b/route.ts'])
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

// ── LIVE-031: the gate must run on EVERY PATH, not merely appear in the file ────────────────────
//
// Every fixture below calls a REAL gate, so `ROUTE_GATE.test(src)` — the entire predicate the route
// scan used to be — is true for all of them. Each test asserts that fact FIRST, because that is the
// blindness being closed: without it, "the new rule fails this route" would prove nothing about
// whether the old one passed it.

/** A gate after an early return that already answered from the service-role client. The `?preview`
 *  path returns member rows with no gate at all; the gate below it never runs for that caller. */
const EARLY_RETURN_ROUTE = `
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: Request) {
  const preview = new URL(req.url).searchParams.get('preview')
  if (preview) {
    const admin = createAdminClient()
    const { data } = await admin.from('profiles').select('id, contact_email, community_role')
    return NextResponse.json({ profiles: data })
  }
  await requireAdmin()
  return NextResponse.json({ ok: true })
}
`

/** GET is gated; POST — the one that WRITES — is not. The file-level scan called this green. */
const HALF_GATED_ROUTE = `
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  await requireAdmin()
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const { id, role } = await req.json()
  await createAdminClient().from('profiles').update({ community_role: role }).eq('id', id)
  return NextResponse.json({ ok: true })
}
`

/** The gate sits on ONE branch. Every other caller is answered without it. */
const BRANCH_GATED_ROUTE = `
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: Request) {
  const { scope } = await req.json()
  if (scope === 'all') {
    await requireAdmin()
  }
  return NextResponse.json({ rows: await rowsFor(scope) })
}
`

/** A gate reached only through an IMPORTED wrapper: the body is not in this file, so the analysis
 *  cannot see whether it runs. It must fail CLOSED rather than assume. */
const IMPORTED_WRAPPER_ROUTE = `
import { withAuth } from '@/lib/http/with-auth'
import { handler } from './handler'

export const POST = withAuth(handler)
export const GET = requireAdmin
`

// ── The other direction: shapes that legitimately gate every path must still pass ───────────────

/** A validation early return BEFORE the gate. Ten of the real gated handlers look like this (a 400
 *  on a malformed body, a 429 from the rate limiter, an empty list for a blank query) and every one
 *  of them is fine: returning early is not the danger, ANSWERING FROM THE ADMIN CLIENT before you
 *  know who is asking is. A rule that fired here would be pure noise, and a noisy gate gets routed
 *  around (ADR-970). */
const VALIDATED_THEN_GATED_ROUTE = `
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: Request) {
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (!body?.id) return new NextResponse(null, { status: 400 })

  await requireAdmin()
  return NextResponse.json({ ok: true })
}
`

/** The cron shape: 27 real routes re-export a local \`handler\` through a wrapper. */
const CRON_ROUTE = `
import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied
  return NextResponse.json({ ok: true })
}

export const GET = withCronHeartbeat('demo-job', handler)
`

/** The app/u/scan shape: both methods delegate to one file-local helper that verifies the token. */
const HELPER_GATED_ROUTE = `
import { NextResponse } from 'next/server'
import { verifyLeadUnsubToken } from '@/lib/connections/lead-unsub'

async function unsubscribe(id: string | null, token: string | null): Promise<boolean> {
  if (!id || !token || !verifyLeadUnsubToken(id, token)) return false
  return true
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const ok = await unsubscribe(url.searchParams.get('c'), url.searchParams.get('t'))
  return new NextResponse(ok ? 'Unsubscribed' : 'Invalid link', { status: ok ? 200 : 400 })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const ok = await unsubscribe(url.searchParams.get('c'), url.searchParams.get('t'))
  return new NextResponse(ok ? 'Unsubscribed' : 'Invalid link', { status: ok ? 200 : 400 })
}
`

/** A gate inside \`try\` still dominates: there is no branch that skips it. Three real routes. */
const TRY_GATED_ROUTE = `
import { requireAdmin } from '@/lib/admin/guard'

export async function GET() {
  try {
    await requireAdmin('janitor')
  } catch {
    return Response.json({ error: 'Not authorized.' }, { status: 403 })
  }
  return Response.json({ ok: true })
}
`

/** Destructured params in the signature: \`GET(_req, { params })\`. Reading the body from the first
 *  \`{\` after the name lands inside the PARAMETER LIST, which made a correctly gated handler read as
 *  ungated in the first draft of this analysis. */
const DESTRUCTURED_PARAMS_ROUTE = `
import { requireAdmin } from '@/lib/admin/guard'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('janitor')
  const { id } = await params
  return Response.json({ id })
}
`

const problemKinds = (src: string) => gateSoundness(src).problems.map((p: { kind: string }) => p.kind)

describe('LIVE-031 — a gate that cannot run on every path is not coverage', () => {
  it('the OLD rule (a gate token anywhere in the file) passes every one of these', () => {
    for (const [name, src] of Object.entries({ EARLY_RETURN_ROUTE, HALF_GATED_ROUTE, BRANCH_GATED_ROUTE, IMPORTED_WRAPPER_ROUTE })) {
      expect(ROUTE_GATE.test(src), name).toBe(true)
    }
  })

  it('FAILS a gate that sits below an early return which already read through the admin client', () => {
    expect(problemKinds(EARLY_RETURN_ROUTE)).toEqual(['pre-gate-admin-query'])
    const r = classifyRoute('app/api/members/route.ts', EARLY_RETURN_ROUTE, {})
    expect(r.problem).toBe('unsound-gate')
  })

  it('FAILS a route where GET is gated and POST is not', () => {
    const { problems } = gateSoundness(HALF_GATED_ROUTE)
    expect(problems.map((p: { method: string; kind: string }) => `${p.method}:${p.kind}`)).toEqual(['POST:ungated-export'])
  })

  it('FAILS a gate that only runs inside one branch of an if', () => {
    expect(problemKinds(BRANCH_GATED_ROUTE)).toEqual(['conditional-gate'])
    expect(gateSoundness(BRANCH_GATED_ROUTE).problems[0].detail).toContain('if')
  })

  it('FAILS CLOSED when the handler body is not in the file at all', () => {
    // "I cannot read it" is not "it is fine" — the same reason loadLedger throws on a missing ledger.
    expect(problemKinds(IMPORTED_WRAPPER_ROUTE)).toEqual(['unresolved-export', 'unresolved-export'])
  })

  it('is not satisfied by a gate token in a comment or a string', () => {
    const faked = `
export async function GET() {
  // requireAdmin() is not needed here
  const note = 'getCallerProfile'
  return Response.json({ ok: true })
}
`
    expect(ROUTE_GATE.test(faked)).toBe(true) // the raw file still contains the words
    expect(gateSoundness(faked).gated).toBe(false)
    expect(gateSoundness(faked).problems).toEqual([]) // no gate at all → the plain no-verdict path
    expect(classifyRoute('app/api/thing/route.ts', faked, {}).problem).toBe('no-verdict')
  })
})

describe('LIVE-031 — and it must not fail the routes that DO gate every path', () => {
  it.each([
    ['a validation early return above the gate', VALIDATED_THEN_GATED_ROUTE],
    ['a cron handler re-exported through a wrapper', CRON_ROUTE],
    ['two methods delegating to one file-local gate helper', HELPER_GATED_ROUTE],
    ['a gate inside try/catch', TRY_GATED_ROUTE],
    ['a handler with destructured route params', DESTRUCTURED_PARAMS_ROUTE],
    ['the plain gated handler', GATED_ROUTE],
  ])('passes %s', (_name, src) => {
    expect(gateSoundness(src).problems).toEqual([])
    expect(classifyRoute('app/api/thing/route.ts', src, {}).source).toBe('gate')
  })

  it('an unsound gate still yields to a HUMAN reading in the ledger', () => {
    // The ordering that matters: a ledgered route is safe because someone read it and the digest
    // pins that reading. An incidental gate token was pinned to nothing.
    const ledger = ledgerFor('app/api/members/route.ts', EARLY_RETURN_ROUTE, { verdict: 'model-gated' })
    const r = classifyRoute('app/api/members/route.ts', EARLY_RETURN_ROUTE, ledger)
    expect(r.problem).toBeNull()
    expect(r.source).toBe('ledger')
  })

  it('names the file, the method and the fix in its failure text', () => {
    const files = { 'app/api/members/route.ts': HALF_GATED_ROUTE }
    const text = formatRouteFailure(scanRoutes(Object.keys(files), {}, (f: string) => files[f as keyof typeof files]))
    expect(text).toContain('does NOT run on every path')
    expect(text).toContain('app/api/members/route.ts')
    expect(text).toContain('POST')
    expect(text).toContain('ungated-export')
    expect(text).toContain(LEDGER_PATH)
  })
})

describe('handlerExports + maskLiterals', () => {
  it('finds every exported method, through both declaration shapes', () => {
    expect(handlerExports(maskLiterals(HALF_GATED_ROUTE)).map((e: { method: string }) => e.method)).toEqual(['GET', 'POST'])
    const cron = handlerExports(maskLiterals(CRON_ROUTE))
    expect(cron).toHaveLength(1)
    expect(cron[0].kind).toBe('wrapped:handler')
  })

  it('preserves offsets so a brace inside a string cannot shift a body boundary', () => {
    const src = 'const page = `<div style="{}">`\nexport async function GET() { await requireAdmin() }\n'
    expect(maskLiterals(src)).toHaveLength(src.length)
    expect(gateSoundness(src).problems).toEqual([])
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
    expect(routes.violations.map((v: RouteResult) => `${v.file} (${v.problem})`)).toEqual([])
    expect(routes.orphans).toEqual([])
  })

  it('keeps the ledger honest: every entry is a real file, a known verdict, and a matching digest', () => {
    const ledger = loadLedger()
    for (const [file, entry] of Object.entries(ledger) as [string, { verdict: string; digest: string }][]) {
      expect(ROUTE_VERDICTS.has(entry.verdict), `${file} verdict`).toBe(true)
      expect(routeDigest(readFileSync(file, 'utf8')), `${file} digest`).toBe(entry.digest)
    }
  })

  it('resolves the two indirections the corpus actually uses, so neither arm is dead code', () => {
    // 27 cron routes gate inside a local `handler` re-exported through withCronHeartbeat, and
    // app/u/scan gates inside a file-local helper both methods call. If either arm regressed, those
    // 28 routes would go red at once — which is a loud failure, but this pins WHY they are green.
    const cron = readFileSync('app/api/cron/demo-decay/route.ts', 'utf8')
    expect(handlerExports(maskLiterals(cron))[0].kind).toBe('wrapped:handler')
    expect(gateSoundness(cron).problems).toEqual([])

    const scan = readFileSync('app/u/scan/route.ts', 'utf8')
    // The gate is in `unsubscribe()`, in NEITHER export's own body.
    for (const e of handlerExports(maskLiterals(scan)) as { method: string; range: [number, number] | null }[]) {
      expect(e.range, `${e.method} body resolved`).not.toBeNull()
      const [start, end] = e.range as [number, number]
      expect(ROUTE_GATE.test(maskLiterals(scan).slice(start, end + 1)), `${e.method} body`).toBe(false)
    }
    expect(gateSoundness(scan).problems).toEqual([])
  })

  it('does not let the ledger swallow the corpus — most routes must earn a verdict from a real gate', () => {
    // The failure mode this guards is the one ADR-970 names: a gate that goes green because
    // everything got asserted. If the assertion ledger ever outgrows the gated set, the route
    // scan has stopped measuring anything.
    const { routes } = runChecks()
    const gated = routes.results.filter((r: RouteResult) => r.source === 'gate').length
    const asserted = routes.results.filter((r: RouteResult) => r.source === 'ledger').length
    expect(asserted).toBeLessThan(gated)
  })
})

// ── HYG-020 (ADR-1135): the ACTION scan is per-export too ───────────────────────────────────────
//
// Same discipline as the LIVE-031 block above: every "must fail" fixture FIRST proves the OLD
// rule (a gate token anywhere in the file) passed it, because that is the blindness being closed.

/** One guard, five exports — the exact complaint in the HYG-020 row. The whole-file rule read
 *  this green off `requireAdmin` in deleteEverything alone. */
const HALF_GATED_ACTIONS = `'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function deleteEverything(id: string) {
  await requireAdmin('janitor')
  await createAdminClient().from('things').delete().eq('id', id)
}

export async function promoteMember(id: string, role: string) {
  await createAdminClient().from('profiles').update({ community_role: role }).eq('id', id)
}
`

/** The requireMarketer shape: the guard helper's RETURN TYPE carries braces, which the old
 *  bodyAfterParams read as the helper's body — so the gate inside was never seen. This single
 *  boundary was ~90 of the 112 false positives a naive per-export scan reports. */
const BRACED_RETURN_TYPE_ACTIONS = `'use server'

import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireMarketer(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  return { id: me.id }
}

export async function createCampaign(name: string): Promise<{ id: string } | null> {
  const who = await requireMarketer()
  if (typeof who === 'string') return null
  const { data } = await createAdminClient().from('campaigns').insert({ name }).select('id').single()
  return data
}
`

/** The lookup-then-gate shape 16 real actions use: resolve slug → id through the admin client,
 *  deny with null, THEN gate on capabilities of that id. Structurally forced (the gate needs the
 *  id) and nothing the query read can escape before the gate — R3 must not fire. */
const LOOKUP_THEN_GATE_ACTIONS = `'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getHubCapabilities } from '@/lib/capabilities'

export async function getHubAdminData(slug: string) {
  const admin = createAdminClient()
  const { data: hub } = await admin.from('hubs').select('id, name').eq('slug', slug).maybeSingle()
  if (!hub) return null
  const caps = await getHubCapabilities(hub.id)
  if (!caps.has('hub.manage')) return null
  return hub
}
`

/** The same shape but ANSWERING pre-gate: the early return carries the queried rows out before
 *  anyone is identified. This is the danger R3 names, and it must still fire. */
const PRE_GATE_ANSWER_ACTIONS = `'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'

export async function listMembers(preview: boolean) {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, contact_email')
  if (preview) return data
  await requireAdmin('janitor')
  return data
}
`

/** A pre-gate MUTATION with only denial-shaped returns: the write happens whether or not the
 *  caller would have passed the gate. Denial-shaped returns must not excuse it. */
const PRE_GATE_MUTATION_ACTIONS = `'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'

export async function resetThing(id: string) {
  const admin = createAdminClient()
  await admin.from('things').update({ state: 'reset' }).eq('id', id)
  if (!id) return null
  await requireAdmin('janitor')
  return null
}
`

/** A gate on one branch only — the else path mutates ungated. R2, action edition. */
const BRANCH_GATED_ACTIONS = `'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function saveThing(scope: string, id: string) {
  if (scope === 'all') {
    await requireAdmin('janitor')
  }
  await createAdminClient().from('things').update({ scope }).eq('id', id)
}
`

/** A per-export annotation: the comment block DIRECTLY ABOVE an export exempts that export only —
 *  the ungated sibling must still be reported. */
const PER_EXPORT_ANNOTATED_ACTIONS = `'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// authz-ok: gated by an httpOnly cookie stash this scan cannot see; the only write is an audit row.
export async function stopSomething() {
  await createAdminClient().from('audit').insert({ what: 'stop' })
}

export async function stillUngated(id: string) {
  await createAdminClient().from('things').delete().eq('id', id)
}
`

/** A file-header annotation (not attached to any export) keeps its historical file-level meaning. */
const FILE_ANNOTATED_ACTIONS = `'use server'

// authz-ok: intentionally PUBLIC + anonymous lead capture; the admin client only checks handle existence.

import { createAdminClient } from '@/lib/supabase/admin'

export async function captureLead(email: string) {
  await createAdminClient().from('leads').insert({ email })
}
`

/** A regex literal carrying a backtick and quotes. Before maskLiterals learned regexes, this
 *  opened a phantom string that masked every export below it out of existence — and an invisible
 *  export is an unscanned public endpoint (found live in nearby/actions.ts). */
const REGEX_THEN_EXPORT_ACTIONS = `'use server'

import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function makeExcerpt(body: string): string {
  return body.replace(/[#*_\`[\\]]/g, '').replace(/\\s+/g, ' ').trim()
}

export async function publishThing(body: string) {
  const caller = await getCallerProfile()
  if (!caller) return null
  await createAdminClient().from('things').insert({ excerpt: makeExcerpt(body), author: caller.id })
  return null
}
`

const actionProblems = (src: string) =>
  (classifyActionFile('app/(main)/x/actions.ts', src)?.problems ?? []).map(
    (p: { method: string; kind: string }) => `${p.method}:${p.kind}`,
  )

describe('HYG-020 — a guard on a sibling export is not coverage', () => {
  it('the OLD rule (a gate token anywhere in the file) passes the fixtures that must now fail', () => {
    for (const [name, src] of Object.entries({ HALF_GATED_ACTIONS, PRE_GATE_ANSWER_ACTIONS, PRE_GATE_MUTATION_ACTIONS, BRANCH_GATED_ACTIONS })) {
      expect(ACTION_GATE.test(src), name).toBe(true)
    }
  })

  it('FAILS the ungated export and names it, leaving the gated sibling alone', () => {
    expect(actionProblems(HALF_GATED_ACTIONS)).toEqual(['promoteMember:ungated-export'])
  })

  it('FAILS an export that answers from the admin client before the gate', () => {
    expect(actionProblems(PRE_GATE_ANSWER_ACTIONS)).toEqual(['listMembers:pre-gate-admin-query'])
  })

  it('FAILS a pre-gate MUTATION even when every pre-gate return is denial-shaped', () => {
    expect(actionProblems(PRE_GATE_MUTATION_ACTIONS)).toEqual(['resetThing:pre-gate-admin-query'])
  })

  it('FAILS a gate that runs on one branch only', () => {
    expect(actionProblems(BRANCH_GATED_ACTIONS)).toEqual(['saveThing:conditional-gate'])
  })

  it('exempts ONLY the export a per-export annotation sits directly above', () => {
    const ann = actionAnnotations(PER_EXPORT_ANNOTATED_ACTIONS)
    expect(ann.fileLevel).toBe(false)
    expect([...ann.exports]).toEqual(['stopSomething'])
    expect(actionProblems(PER_EXPORT_ANNOTATED_ACTIONS)).toEqual(['stillUngated:ungated-export'])
  })

  it('keeps the historical file-level meaning for an annotation not attached to any export', () => {
    const ann = actionAnnotations(FILE_ANNOTATED_ACTIONS)
    expect(ann.fileLevel).toBe(true)
    expect(classifyActionFile('app/(main)/x/actions.ts', FILE_ANNOTATED_ACTIONS)).toBeNull()
  })
})

describe('HYG-020 — and the shapes that made a naive scan report 112 false positives must pass', () => {
  it('sees the gate inside a helper whose RETURN TYPE carries braces', () => {
    expect(actionProblems(BRACED_RETURN_TYPE_ACTIONS)).toEqual([])
  })

  it('passes the lookup-then-gate shape: a pre-gate resolve whose only escape is a denial', () => {
    expect(actionProblems(LOOKUP_THEN_GATE_ACTIONS)).toEqual([])
  })

  it('still sees exports below a regex literal that carries a backtick', () => {
    const masked = maskLiterals(REGEX_THEN_EXPORT_ACTIONS)
    expect(actionExports(masked).map((e: { method: string }) => e.method)).toEqual(['publishThing'])
    expect(actionProblems(REGEX_THEN_EXPORT_ACTIONS)).toEqual([])
  })

  it('lexes a template interpolation as code, so a nested template cannot spill markup into it', () => {
    const src = 'const page = `<p>${name ? `<b>${name}</b>` : \'\'}</p>`\nexport async function GET() { await requireAdmin() }\n'
    const masked = maskLiterals(src)
    expect(masked).toHaveLength(src.length)
    expect(handlerExports(masked).map((e: { method: string }) => e.method)).toEqual(['GET'])
    expect(gateSoundness(src).problems).toEqual([])
  })
})

describe('HYG-020 — the real action corpus', () => {
  it('scans every admin-client action export, well past both floors, and finds them all gated', () => {
    const { actions } = runChecks()
    expect(actions.fileCount).toBeGreaterThanOrEqual(MIN_ACTION_FILES)
    expect(actions.exportCount).toBeGreaterThanOrEqual(MIN_ACTION_EXPORTS)
    expect(
      actions.violations.flatMap((v: { file: string; problems: { method: string }[] }) =>
        v.problems.map((p) => `${v.file} :: ${p.method}`),
      ),
    ).toEqual([])
  })

  it('scanActions is not vacuous: the multi-export fixture fails through the same entry point runChecks uses', () => {
    const files = { 'app/(main)/x/actions.ts': HALF_GATED_ACTIONS }
    const out = scanActions(Object.keys(files), (f: string) => files[f as keyof typeof files])
    expect(out.fileCount).toBe(1)
    expect(out.violations).toHaveLength(1)
    expect(out.violations[0].problems[0].method).toBe('promoteMember')
  })
})
