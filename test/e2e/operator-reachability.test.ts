import { existsSync, readFileSync } from 'node:fs'
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
// flaky capture for two weeks (ADR-1313).
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

function read(rel: string): string | null {
  const abs = join(process.cwd(), rel)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

function pageSourceFor(routePath: string): string | null {
  return read(join('app', '(main)', routePath.replace(/^\//, ''), 'page.tsx'))
}

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
function governingGuard(routePath: string): { source: string; from: string } | null {
  const segments = routePath.replace(/^\//, '').split('/')
  for (let i = segments.length; i > 0; i--) {
    const dir = join('app', '(main)', ...segments.slice(0, i))
    const candidates = i === segments.length ? ['page.tsx', 'layout.tsx'] : ['layout.tsx']
    for (const file of candidates) {
      const src = read(join(dir, file))
      if (src && ANY_GUARD.test(src)) return { source: src, from: join(dir, file) }
    }
  }
  return null
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
          `(ADR-1313).`,
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
