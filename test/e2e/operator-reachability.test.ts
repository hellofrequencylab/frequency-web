import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { operatorSurfaces } from './surfaces'

// ── AN OPERATOR SURFACE THE E2E ACCOUNT CANNOT OPEN IS NOT COVERAGE ──────────────────────────────
//
// `OPERATOR_PATHS` was chosen by counting raw buttons (`scripts/visual-surface-census.mjs`) and
// NOBODY CHECKED WHETHER THE ACCOUNT DRIVING THE SUITE COULD REACH WHAT IT NAMED. Two of the seven
// it picked — `/admin/crm`, and `/admin/elements` had it been next — are `requireAdmin('janitor')`
// with no staff escape, which no `team_members` role can satisfy at any seniority. The suite named
// them, bounced off them, photographed `/feed` under their names, and the whole thing read as a
// flaky capture for two weeks (ADR-1314).
//
// This is the guard that makes the list honest: a route is only worth watching if the credential
// that drives the suite can open it.
//
// SOURCE-SHAPE, deliberately. The alternative is a live authz call, which needs a session, a
// deployment and a database — exactly the machinery whose absence made this defect invisible. The
// page's own guard call is a fact on disk, readable in CI, on every PR, in milliseconds.

// 🔴 EVERY PATTERN REQUIRES `await`, AND THAT IS THE COMMENT FILTER. Both of the files that made
// the first two versions of this guard wrong describe a guard in prose without calling it:
// `app/(main)/admin/crm/page.tsx` has the line `// STAFF-GATED: requireAdmin('janitor')` and
// `app/(main)/admin/marketing/layout.tsx` says `// requireAdminFloor() floor` while calling
// nothing. A call site has `await`; a sentence about one does not. That beats stripping comments,
// which on this codebase eats real code (see layout-editor.scope.test.ts for what that costs).

/** `requireAdminFloor()` admits any staff role that can READ an admin domain. */
const FLOOR = /await\s+requireAdminFloor\s*\(/

/** `requireAdmin(min, { staff: 'domain' })` — the staff escape is the second argument. */
const ADMIN_WITH_STAFF = /await\s+requireAdmin\s*\(\s*[^)]*\bstaff\s*:/

/** `requireAdmin('janitor')` / `requireAdmin('admin')` with NO staff key: web_role only. */
const ADMIN_WEB_ROLE_ONLY = /await\s+requireAdmin\s*\(\s*'[a-z]+'\s*\)/

/** Any real guard call, used to find WHICH level governs. */
const ANY_GUARD = /await\s+require(?:AdminFloor|Admin)\s*\(/

function read(rel: string, root: string = process.cwd()): string | null {
  const abs = join(root, rel)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

function pageSourceFor(routePath: string): string | null {
  return read(join('app', '(main)', routePath.replace(/^\//, ''), 'page.tsx'))
}

/** `actions.ts` / `<thing>-actions.ts` — the server-action modules that live beside a page. */
const ACTION_MODULE = /(?:^|-)actions\.ts$/

/**
 * The source of the guard that actually GOVERNS this route — most specific wins.
 *
 * 🔴 TWO WRONG VERSIONS PRECEDED THIS ONE, AND BOTH FAILURES ARE WORTH KEEPING.
 *
 *  1. READING ONLY `page.tsx` called `/admin/marketing/nurture` unreachable, when it declares no
 *     guard of its own and inherits the floor from `app/(main)/admin/layout.tsx`. The capture had
 *     already photographed that route for real, so the gate was contradicting an observed artifact.
 *
 *  2. READING THE WHOLE CHAIN AND ADMITTING IF *ANY* LEVEL PASSED called EVERY /admin route
 *     reachable — including `/admin/crm`, the route this whole change exists because of — because
 *     `app/(main)/admin/layout.tsx` always calls `requireAdminFloor()`. Clearing the floor is
 *     NECESSARY and NOT SUFFICIENT: the page's own stricter `requireAdmin('janitor')` still denies
 *     underneath it. The mutation test caught this; the assertion had been passing for the wrong
 *     reason.
 *
 * So: walk most-specific outward and stop at the FIRST level that actually calls a guard. That one
 * decides, exactly as it does at run time.
 */
function governingGuard(routePath: string, root?: string): { source: string; from: string } | null {
  const segments = routePath.replace(/^\//, '').split('/')
  for (let i = segments.length; i > 0; i--) {
    const dir = join('app', '(main)', ...segments.slice(0, i))
    const candidates = i === segments.length ? ['page.tsx', 'layout.tsx'] : ['layout.tsx']
    for (const file of candidates) {
      const src = read(join(dir, file), root)
      if (src && ANY_GUARD.test(src)) return { source: src, from: join(dir, file) }
    }
  }
  return null
}

/**
 * THE SECOND HALF OF "REACHABLE" — the route's own SERVER ACTIONS (LIVE-289).
 *
 * The guard above was green over `/admin/library` for the entire life of the defect it was written
 * to catch, because it only ever read `page.tsx` / `layout.tsx`. That page says, in its own comment,
 * that a Marketer must be admitted "or it offers a row that redirects" — and it calls
 * `requireAdmin('janitor', { staff: 'marketing' })`. Then all 27 server actions beside it called
 * bare `requireAdmin('janitor')`, which `lib/admin/guard.ts` answers with `redirect('/feed')`. Same
 * account, same request: the page admitted and the actions denied. `create-studio.tsx` fires
 * `listBrandStyles()` in an on-mount effect, so the browser left the route seconds after load with
 * nobody having clicked anything, and the visual capture skipped `/admin/library` while every input
 * the harness read said "admit".
 *
 * A page that admits a staff role and actions that do not is not reachable in any useful sense, so
 * this returns every `requireAdmin('<role>')` call in the route's action modules that carries NO
 * `{ staff }` escape. Same source-shape idiom, same `await` comment filter as above — the door note
 * now at the top of `app/(main)/admin/library/actions.ts` QUOTES the bare call in prose, and this is
 * what keeps that sentence from reading as a call site.
 *
 * ⚠️ SCOPE, STATED SO IT IS NOT READ AS "EVERY DOOR ON THE ROUTE": the route's own directory, which
 * is where a route's actions live by convention and where this defect lived. An action imported from
 * `lib/` is shared by many callers and is not this gate's question. A hand-rolled gate
 * (`app/(main)/admin/marketing/nurture/actions.ts` resolves the marketing capability itself, without
 * `requireAdmin`) is not a `requireAdmin` call and is correctly not flagged — this looks for the
 * exact shape that DENIES, not for the absence of one shape. And an `app/api/**` route the page
 * FETCHES is out of reach here: `app/api/airwaves/assets/[id]/usage/route.ts` is bare-janitor and
 * 403s a Marketer, deliberately (it reads across the service-role Airwaves tables), and it is fetched
 * on drawer-open rather than on mount, so it costs a panel and never the route. This gate is about
 * the guards that decide whether the ROUTE holds.
 */
function webRoleOnlyActionGuards(routePath: string, root: string = process.cwd()): string[] {
  const dir = join('app', '(main)', routePath.replace(/^\//, ''))
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  const found: string[] = []
  for (const file of readdirSync(abs).sort()) {
    if (!ACTION_MODULE.test(file)) continue
    const src = readFileSync(join(abs, file), 'utf8')
    src.split('\n').forEach((line, i) => {
      if (ADMIN_WEB_ROLE_ONLY.test(line)) found.push(`${join(dir, file)}:${i + 1}: ${line.trim()}`)
    })
  }
  return found
}

describe('every watched operator surface is reachable by a team_members staff role', () => {
  const surfaces = operatorSurfaces()

  it('watches a non-empty set that resolves to real pages', () => {
    expect(surfaces.length).toBeGreaterThan(0)
    for (const s of surfaces) {
      expect(pageSourceFor(s.path), `${s.path} has no page.tsx — the census named a route that does not exist`).not.toBeNull()
    }
  })

  it.each(surfaces.map((s) => s.path))(
    '%s can be opened without web_role admin or janitor',
    (path) => {
      const governing = governingGuard(path)
      expect(governing, `${path} is behind no guard at all, which is its own problem`).not.toBeNull()
      const { source, from } = governing!
      const reachable = FLOOR.test(source) || ADMIN_WITH_STAFF.test(source)
      expect(
        reachable,
        `${path} is governed by ${from}, which calls requireAdmin('<role>') with no { staff } ` +
          `escape — so NO team_members role opens it at any seniority, only web_role admin or ` +
          `janitor, which a Playwright credential must never hold. Either give that guard a staff ` +
          `domain or drop the route from OPERATOR_PATHS. This is the exact trap /admin/crm set ` +
          `(ADR-1314).`,
      ).toBe(true)
    },
  )

  it('names the specific routes that are web_role-only, so the failure says what to swap', () => {
    // A positive control: the detector must actually recognise the shape it is looking for, or the
    // assertion above passes by never matching anything (ADR-949).
    expect(ADMIN_WEB_ROLE_ONLY.test("const x = await requireAdmin('janitor')")).toBe(true)
    expect(ADMIN_WITH_STAFF.test("await requireAdmin('host', { staff: 'community' })")).toBe(true)
    expect(FLOOR.test('await requireAdminFloor()')).toBe(true)
    // …and must NOT read a staff escape into a guard that has none.
    expect(ADMIN_WITH_STAFF.test("await requireAdmin('janitor')")).toBe(false)
    // …and must not mistake PROSE about a guard for a call. Both real files below do exactly this.
    expect(ANY_GUARD.test("// STAFF-GATED: requireAdmin('janitor'). The /admin/* group mounts")).toBe(false)
    expect(FLOOR.test('// requireAdminFloor() floor. This layout re-asserts Marketing own')).toBe(false)
    // …and the real /admin/crm page must read as web_role-only, or this guard proves nothing.
    const crm = read(join('app', '(main)', 'admin', 'crm', 'page.tsx'))
    expect(crm).not.toBeNull()
    expect(ADMIN_WEB_ROLE_ONLY.test(crm!)).toBe(true)
    expect(ADMIN_WITH_STAFF.test(crm!)).toBe(false)
  })

  it('no longer watches /admin/crm, which no staff role can open', () => {
    expect(surfaces.map((s) => s.path)).not.toContain('/admin/crm')
  })
})

describe("every watched surface's own server actions admit whoever its page admits", () => {
  const surfaces = operatorSurfaces()

  it.each(surfaces.map((s) => s.path))(
    "%s: no action beside it demands web_role where the page doesn't",
    (path) => {
      const governing = governingGuard(path)
      expect(governing).not.toBeNull()
      const { source, from } = governing!
      // A page that is itself web_role-only is the sibling assertion's failure, not this one's —
      // failing twice for one cause just makes the real fix harder to read.
      if (!(FLOOR.test(source) || ADMIN_WITH_STAFF.test(source))) return
      const offenders = webRoleOnlyActionGuards(path)
      expect(
        offenders,
        `${path} is OPENED by ${from} (which admits a team_members staff role) and then its own ` +
          `server actions deny that same account:\n  ${offenders.join('\n  ')}\n` +
          `requireAdmin('<role>') with no { staff } escape redirects to /feed, so these are ` +
          `controls the page renders and then throws the operator off the route for using — and one ` +
          `of them firing in an on-mount effect is how /admin/library went unphotographed for two ` +
          `weeks (LIVE-289). Give each the page's own gate, or use ` +
          `authorizeAction(caller, '<role>', '<domain>') where a throw is wanted over a redirect.`,
      ).toEqual([])
    },
  )

  it('CONTROL: catches the /admin/library defect rebuilt from scratch, and clears its fix', () => {
    // 🔴 A guard with no control is the thing that let this through (ADR-949). So: build the exact
    // pair on disk — a page that admits `{ staff: 'marketing' }`, an action module beside it that
    // does not — and prove BOTH verdicts, on the same code path the assertion above runs, walking a
    // real directory rather than a hand-passed string.
    const root = mkdtempSync(join(tmpdir(), 'operator-reachability-'))
    const dir = join(root, 'app', '(main)', 'admin', 'fixture')
    mkdirSync(dir, { recursive: true })

    const page = [
      "import { requireAdmin } from '@/lib/admin/guard'",
      'export default async function Page() {',
      "  const ctx = await requireAdmin('janitor', { staff: 'marketing' })",
      '  return <Studio ctx={ctx} />',
      '}',
    ].join('\n')
    writeFileSync(join(dir, 'page.tsx'), page)

    const bare = [
      "'use server'",
      "// Studio-gated. The prose here QUOTES requireAdmin('janitor') without calling it.",
      'export async function listBrandStyles() {',
      "  await requireAdmin('janitor')",
      '  return []',
      '}',
    ].join('\n')
    writeFileSync(join(dir, 'recraft-actions.ts'), bare)

    // The page reads as admitting a staff role…
    const governing = governingGuard('/admin/fixture', root)
    expect(governing?.from).toBe(join('app', '(main)', 'admin', 'fixture', 'page.tsx'))
    expect(ADMIN_WITH_STAFF.test(governing!.source)).toBe(true)
    // …and the action beside it is caught, once, at the line that calls it and not the line that
    // merely names it.
    const caught = webRoleOnlyActionGuards('/admin/fixture', root)
    expect(caught).toHaveLength(1)
    expect(caught[0]).toContain('recraft-actions.ts:4')
    expect(caught[0]).toContain("requireAdmin('janitor')")

    // THE CORRECTED PAIR: the same module carrying the page's own gate is clean.
    // (The swap targets the AWAITED call, not the sentence above it that quotes the same text —
    // a first-occurrence replace edits the comment and leaves the call, which is how this control
    // earned its keep before it ever shipped.)
    const fixed = bare.replace("await requireAdmin('janitor')", "await requireAdmin('janitor', { staff: 'marketing' })")
    expect(fixed).not.toBe(bare)
    writeFileSync(join(dir, 'recraft-actions.ts'), fixed)
    expect(webRoleOnlyActionGuards('/admin/fixture', root)).toEqual([])

    // And a route with no action modules at all is clean rather than unreadable.
    expect(webRoleOnlyActionGuards('/admin/nothing-here', root)).toEqual([])

    rmSync(root, { recursive: true, force: true })
  })

  it('CONTROL: /admin/library — the route this exists for — carries the gate on every action', () => {
    // The regression itself, pinned. 27 calls across six modules on 2026-09-10; the assertion is on
    // the SHAPE, so a 28th action inherits it without an edit here.
    expect(webRoleOnlyActionGuards('/admin/library')).toEqual([])
    const actions = read(join('app', '(main)', 'admin', 'library', 'actions.ts'))
    expect(actions).not.toBeNull()
    expect(ADMIN_WITH_STAFF.test(actions!)).toBe(true)
  })
})
