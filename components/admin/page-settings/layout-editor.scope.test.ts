import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── ONE INSTANCE OF MANY (ADR-1312) ──────────────────────────────────────────────────────────────
//
// The Layout editor offers two scopes and defaults to "This page". On an ENTITY DETAIL route that
// is one of an open-ended set — `/events/<slug>`, `/circles/<slug>`, `/practices/<id>` — a per-page
// save reaches exactly one of them, and nothing said so. Measured on production 2026-09-10: 21
// `page_settings` rows under `/events/`, 7 of them different dates of ONE Meld series, each with a
// different arrangement, and ZERO rows at any scope key. The operator read that as the editor
// losing their work.
//
// A source-shape guard rather than a render test: the component is a client component with
// `usePathname`, and what must not regress is the CONDITION and the honesty of the copy, both of
// which are readable in the source. The behaviour is deliberately unchanged — "This page" is still
// the default — because silently widening a save's blast radius is a worse failure than the one
// being fixed.
const SRC = readFileSync(
  join(process.cwd(), 'components/admin/page-settings/layout-editor.tsx'),
  'utf8',
)

// 🔴 NO COMMENT-STRIPPING HERE, DELIBERATELY. The obvious version of this guard stripped comments
// first and silently ate HALF THE FILE (22,021 chars to 11,773): this component interleaves plain
// `/* */` blocks with JSX `{/* */}` ones, so a non-greedy block match pairs the opener of one with
// the closer of a later one and swallows the real code between them. Every string asserted below is
// a code identifier that appears nowhere in the prose, so the raw source is both safer and truer.

describe('the Layout editor says when a page is one instance of many', () => {
  it('derives instance-ness from the route depth, not a hardcoded list of sections', () => {
    // A list would go stale the day a new entity route is added; depth cannot.
    expect(SRC).toContain("const isInstanceRoute = pathname.split('/').filter(Boolean).length > 1")
    expect(SRC).not.toMatch(/isInstanceRoute\s*=\s*\[/)
  })

  it('warns only where it is true and only for the scope where it bites', () => {
    expect(SRC).toContain("isInstanceRoute && choice === 'page'")
  })

  it('offers the section scope as a one-click escape rather than only describing it', () => {
    // A hint that names the fix and makes you go find it is half a fix.
    expect(SRC).toMatch(/onClick=\{\(\) => chooseScope\('section'\)\}/)
  })

  it('does NOT change the default scope — widening a save silently is the worse failure', () => {
    expect(SRC).toMatch(/useState<ScopeChoice>\('page'\)/)
  })

  it('keeps the plain wording for a section index, which is not an instance', () => {
    // `/events` is the only page at its own key; the instance warning would be a lie there.
    expect(SRC).toContain("'Applies to this exact page.'")
  })

  it('states the consequence in the per-page hint, not just in the nudge below it', () => {
    // The nudge is easy to miss; the hint is the line an operator is already reading.
    expect(SRC).toMatch(/Applies to this ONE page only/)
    expect(SRC).toMatch(/a new one starts from the section default/)
  })
})
