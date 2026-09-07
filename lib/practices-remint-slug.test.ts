import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-201 — A PRACTICE'S PUBLIC URL MUST NOT STAY FROZEN AT `untitled-practice-N`.
//
// `uniquePracticeSlug` was called at CREATE and at FORK and nowhere else, and a practice is
// created BEFORE it is named: createPracticeDraftAction stamps the literal title
// 'Untitled practice', which slugs to `untitled-practice-N`. `updatePractice` then wrote the real
// title and never revisited the slug — so the URL a member, or Vera, named the practice into was
// never the URL the practice kept. That reached Search Console: a practice titled "Daily
// Hypnosis" since July was submitted as `/discover/practices/untitled-practice-2` (LIVE-188, whose
// 308 lives in next.config.ts).
//
// These tests drive the REAL updatePractice against a mocked database and assert on the UPDATE
// PAYLOAD, which is the consequence: what actually lands in the `slug` column. The four cases are
// the four clauses of the gate, and each one is a URL that must not move:
//   1. private + placeholder slug + real title  → RE-MINT (the fix)
//   2. PUBLIC + placeholder slug                → never touched (an indexed URL keeps its signal)
//   3. an author-earned slug                    → never touched (a real title chose it once)
//   4. still unnamed ('Untitled practice' again) → never bumped to `untitled-practice-3`

interface Row {
  id: string
  title: string
  slug: string | null
  is_public: boolean
  [k: string]: unknown
}

let row: Row
let updatePayload: Record<string, unknown> | null = null
/** Slugs already taken by OTHER practices, as uniquePracticeSlug's ilike prefix scan sees them. */
let takenSlugs: string[] = []

function builder() {
  let mode: 'read' | 'write' = 'read'
  let payload: Record<string, unknown> | null = null
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    // uniquePracticeSlug's terminal: the prefix scan of slugs already in use.
    ilike: async () => ({ data: takenSlugs.map((slug) => ({ slug })), error: null }),
    update(p: Record<string, unknown>) {
      mode = 'write'
      payload = p
      updatePayload = p
      return api
    },
    async maybeSingle() {
      // Reads return the pre-edit row (getPractice); the write returns the row as saved.
      return { data: mode === 'write' ? { ...row, ...payload } : { ...row }, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))
// The embedding refresh is a best-effort side effect of a title change; keep it out of the way.
vi.mock('@/lib/practices/embeddings', () => ({ embedPractice: async () => {} }))

const { updatePractice } = await import('./practices')

beforeEach(() => {
  updatePayload = null
  takenSlugs = []
  row = { id: 'p-1', title: 'Untitled practice', slug: 'untitled-practice-2', is_public: false }
})

describe('updatePractice re-mints a placeholder slug (LIVE-201)', () => {
  it('RE-MINT: naming a private, still-placeholder practice moves its slug to the title', async () => {
    await updatePractice('p-1', { title: 'Daily Hypnosis' })
    expect(updatePayload?.title).toBe('Daily Hypnosis')
    expect(updatePayload?.slug).toBe('daily-hypnosis')
  })

  it('re-mints from the bare placeholder too, not only the numbered ones', async () => {
    row.slug = 'untitled-practice'
    await updatePractice('p-1', { title: 'Box Breathing' })
    expect(updatePayload?.slug).toBe('box-breathing')
  })

  it('the re-minted slug is UNIQUE: it steps past a slug another practice already holds', async () => {
    takenSlugs = ['daily-hypnosis']
    await updatePractice('p-1', { title: 'Daily Hypnosis' })
    expect(updatePayload?.slug).toBe('daily-hypnosis-2')
  })

  it('PUBLIC PRACTICE: an already-crawlable URL is never silently moved', async () => {
    row.is_public = true
    await updatePractice('p-1', { title: 'Daily Hypnosis' })
    expect(updatePayload?.title).toBe('Daily Hypnosis')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('AUTHOR-EARNED SLUG: a slug a real title already chose is never re-minted', async () => {
    row.slug = 'morning-ritual'
    await updatePractice('p-1', { title: 'Evening Ritual' })
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('STILL UNNAMED: re-saving the placeholder title cannot bump it to untitled-practice-3', async () => {
    await updatePractice('p-1', { title: 'Untitled practice' })
    expect(updatePayload?.title).toBe('Untitled practice')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('an empty title falls back to the placeholder and still leaves the slug alone', async () => {
    await updatePractice('p-1', { title: '   ' })
    expect(updatePayload?.title).toBe('Untitled practice')
    expect(updatePayload).not.toHaveProperty('slug')
  })

  it('a title that slugifies to nothing (punctuation only) never mints a "practice" slug', async () => {
    await updatePractice('p-1', { title: '!!!' })
    expect(updatePayload).not.toHaveProperty('slug')
  })

  // The exact LIVE-188 row shape: already titled, still private, still on the placeholder slug.
  // The re-mint is keyed on a TITLE WRITE, not on the row looking wrong, so an unrelated edit is
  // not a slug event. (The stock of already-titled private practices predating this fix therefore
  // heals on their next title edit, not on any edit — a data backfill, not a code path.)
  it('NOT A SLUG EVENT: a patch with no title leaves a placeholder slug alone', async () => {
    row.title = 'Daily Hypnosis'
    await updatePractice('p-1', { summary: 'A calm start to the day' })
    expect(updatePayload).not.toHaveProperty('slug')
  })
})
