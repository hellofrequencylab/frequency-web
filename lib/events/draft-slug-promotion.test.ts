import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// SOURCE-SHAPE test for the publish-time slug promotion in lib/events/event-drafts.ts.
//
// Why source-shape rather than behavioural: event-drafts.ts is `import 'server-only'` and every
// function in it goes straight to a service-role Supabase handle, so exercising publishEventDraft
// here would mean mocking the whole client and asserting against the mock — a test of the mock.
// The rules this file pins are structural and each one is a defect that actually shipped, so a
// grep-shaped guard is the honest instrument: it fails when someone removes the rule, which is
// the regression that matters.
//
// THE INCIDENT (2026-08-29, ADR-1172). mintSlug ran at DRAFT creation, so the first draft of a
// poster took the clean `title-date` slug and every later one carried `-<6 hex>` forever. A member
// scanned a poster, abandoned that draft, scanned again, and published the SECOND one — so the
// abandoned draft kept the pretty URL and the live event wore the suffix. The link they shared
// resolved to a draft, which is not publicly viewable, and their guest hit a dead end.

const SRC = readFileSync(path.join(process.cwd(), 'lib/events/event-drafts.ts'), 'utf8')

describe('mintSlug', () => {
  it('checks the SUFFIXED candidate too, not only the base', () => {
    // The old version returned `base-<hex>` without ever asking whether that was free.
    expect(SRC).toMatch(/const candidate = attempt === 0 \? base : /)
    expect(SRC).toMatch(/\.eq\('slug', candidate\)/)
  })

  it('bounds the walk instead of looping forever', () => {
    expect(SRC).toMatch(/attempt < \d+/)
  })
})

describe('claimCanonicalSlug — a published event outranks a draft for the canonical URL', () => {
  it('exists and is called from publishEventDraft BEFORE the status flip', () => {
    expect(SRC).toMatch(/async function claimCanonicalSlug\(/)
    const publishIdx = SRC.indexOf('export async function publishEventDraft')
    const callIdx = SRC.indexOf('await claimCanonicalSlug(', publishIdx)
    const firstStatusFlip = SRC.indexOf("status: 'published'", publishIdx)
    expect(callIdx).toBeGreaterThan(-1)
    // Claim the slug first; otherwise the row is briefly live under a URL we then change.
    expect(callIdx).toBeLessThan(firstStatusFlip)
  })

  it('only ever steps aside the SAME poster’s own DRAFT — never a published row, never someone else’s', () => {
    const fn = SRC.slice(
      SRC.indexOf('async function claimCanonicalSlug('),
      SRC.indexOf('/** A url-safe, hard-to-guess one-time claim secret. */'),
    )
    expect(fn).toContain("holder.status !== 'draft'")
    expect(fn).toContain('holder.posted_by_profile_id !== posterProfileId')
    // The sideways move is itself guarded, so a concurrent publish of that draft wins instead.
    expect(fn).toMatch(/\.eq\('status', 'draft'\)/)
    expect(fn).toMatch(/\.eq\('posted_by_profile_id', posterProfileId\)/)
  })

  it('keeps the existing slug whenever it cannot claim cleanly (a working URL beats a failed publish)', () => {
    const fn = SRC.slice(
      SRC.indexOf('async function claimCanonicalSlug('),
      SRC.indexOf('/** A url-safe, hard-to-guess one-time claim secret. */'),
    )
    // Every bail-out returns the slug the event already has, never null-by-accident.
    expect(fn.match(/return currentSlug/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})

describe('the promoted slug reaches everything publish hands out', () => {
  const publishBody = SRC.slice(SRC.indexOf('export async function publishEventDraft'))

  it('is written on BOTH ownership branches', () => {
    expect(publishBody.match(/slug: finalSlug \} : \{\}\)/g)?.length ?? 0).toBe(2)
  })

  it('is what the claim-invite EMAIL links to', () => {
    // The invite is sent during publish; the pre-publish slug would 404 on open.
    expect(publishBody).toMatch(/slug: finalSlug \?\? draft\.slug,/)
  })

  it('is what publish RETURNS, so the caller redirects to a URL that exists', () => {
    expect(publishBody).toMatch(/return \{ slug: finalSlug \?\? draft\.slug \?\? '', zapsAwarded: 0 \}/)
    expect(publishBody).toMatch(/return \{ slug: finalSlug \?\? draft\.slug \?\? '', claimToken/)
  })

  it('leaves draft.slug unused as a publish OUTPUT anywhere', () => {
    // The bug class: one surface still handing out the pre-promotion slug is a dead link, and it
    // is invisible until someone opens it. Any `draft.slug` left in publish must be a fallback.
    const bare = publishBody.match(/slug: draft\.slug(?!\s*\?\?)/g) ?? []
    expect(bare, `unguarded draft.slug in publish: ${bare.join(', ')}`).toHaveLength(0)
  })
})
