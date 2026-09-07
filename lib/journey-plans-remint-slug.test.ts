import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-202 — A JOURNEY'S PUBLIC URL MUST NOT STAY FROZEN AT `untitled-journey-<random>`.
//
// `slugify` ran at CREATE, FORK and DUPLICATE and nowhere else, and a journey is created BEFORE it
// is named: the no-template path of app/(main)/journeys/create-actions.ts stamps the literal title
// 'Untitled journey'. `updatePlan` then wrote the real title and never revisited the slug, so the
// URL a member named the journey into was never the URL the journey kept — and app/sitemap.ts
// advertises /discover/journeys/<slug> for every PUBLIC journey, so publishing froze the
// placeholder into Search Console. Same mechanism as LIVE-188/LIVE-201, one entity over.
//
// These tests drive the REAL updatePlan against a mocked database and assert on the UPDATE PAYLOAD,
// which is the consequence: what actually lands in the `slug` column. The cases are the clauses of
// the gate, and each one is a URL that must not move.

interface Row {
  slug: string | null
  visibility: string
}

let row: Row
let updatePayload: Record<string, unknown> | null = null

function builder() {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    update(p: Record<string, unknown>) {
      updatePayload = p
      return api
    },
    // The write terminates on `.eq(...)`, so the builder itself is awaitable.
    then(res: (v: { error: null }) => void) {
      res({ error: null })
    },
    async maybeSingle() {
      return { data: row ? { ...row } : null, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))
// updatePlan itself needs neither of these, but the module graph pulls them in at import time.
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root' }))

const { updatePlan } = await import('@/lib/journey-plans')

beforeEach(() => {
  updatePayload = null
  row = { slug: 'untitled-journey-a1b2c3', visibility: 'private' }
})

describe('updatePlan re-mints a frozen untitled-journey slug (LIVE-202)', () => {
  it('re-mints when a private journey carrying the placeholder slug is finally named', async () => {
    await updatePlan('p1', { title: 'Morning Light' })
    expect(updatePayload?.title).toBe('Morning Light')
    expect(String(updatePayload?.slug)).toMatch(/^morning-light-[0-9a-z]{1,6}$/)
  })

  it('leaves a PUBLIC journey alone, because its URL is in the sitemap', async () => {
    row = { slug: 'untitled-journey-a1b2c3', visibility: 'public' }
    await updatePlan('p1', { title: 'Morning Light' })
    expect(updatePayload?.title).toBe('Morning Light')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('leaves a slug a real title already earned alone, even while private', async () => {
    row = { slug: 'deep-rest-9f8e7d', visibility: 'private' }
    await updatePlan('p1', { title: 'Morning Light' })
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('does not churn the URL of a journey that is still unnamed', async () => {
    await updatePlan('p1', { title: 'Untitled journey' })
    expect(updatePayload?.title).toBe('Untitled journey')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('does not churn the URL when the title is blanked back to the placeholder', async () => {
    await updatePlan('p1', { title: '   ' })
    expect(updatePayload?.title).toBe('Untitled journey')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('never touches the slug when no title is being written', async () => {
    await updatePlan('p1', { summary: 'a new summary' })
    expect(updatePayload?.summary).toBe('a new summary')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('does not mistake a real title that merely starts with the placeholder root', async () => {
    // `untitled-journey-recipes` is what the title "Untitled journey recipes" earns. The suffix is
    // seven characters, and slugify's random suffix is at most six, so the shape does not match.
    row = { slug: 'untitled-journey-recipes', visibility: 'private' }
    await updatePlan('p1', { title: 'Morning Light' })
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('re-mints from the title as SAVED, not the raw patch (trimmed and capped at 120)', async () => {
    const long = `  ${'z'.repeat(200)}  `
    await updatePlan('p1', { title: long })
    expect(String(updatePayload?.title)).toBe('z'.repeat(120))
    // slugRoot caps the root at 48 characters, so the slug follows the saved title, not the patch.
    expect(String(updatePayload?.slug)).toMatch(/^z{48}-[0-9a-z]{1,6}$/)
  })

  it('still writes the title when the row cannot be read', async () => {
    row = null as unknown as Row
    await updatePlan('p1', { title: 'Morning Light' })
    expect(updatePayload?.title).toBe('Morning Light')
    expect(updatePayload).not.toHaveProperty('slug')
  })
})
