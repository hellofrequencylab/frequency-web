import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'

vi.mock('server-only', () => ({}))

const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        is: () => q,
        limit: () => q,
        maybeSingle,
      }
      return q
    },
  }),
}))

import {
  UNLISTED_EVENT_ROBOTS,
  getPublicEventLinkVisibility,
  isUnlistedShare,
} from './public-indexability'

describe('isUnlistedShare', () => {
  it('is true only for the unlisted visibility value', () => {
    expect(isUnlistedShare('unlisted')).toBe(true)
    expect(isUnlistedShare('public')).toBe(false)
    expect(isUnlistedShare('circle_only')).toBe(false)
    expect(isUnlistedShare('private')).toBe(false)
    expect(isUnlistedShare(null)).toBe(false)
    expect(isUnlistedShare(undefined)).toBe(false)
  })
})

describe('UNLISTED_EVENT_ROBOTS', () => {
  it('noindexes and still follows, which is the SCAN-1014 contract', () => {
    expect(UNLISTED_EVENT_ROBOTS).toEqual({ index: false, follow: true })
  })
})

describe('getPublicEventLinkVisibility', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
  })

  it('returns public and unlisted from a published, not-removed row', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { visibility: 'unlisted' }, error: null })
    expect(await getPublicEventLinkVisibility('secret-circle')).toBe('unlisted')
    maybeSingle.mockResolvedValueOnce({ data: { visibility: 'public' }, error: null })
    expect(await getPublicEventLinkVisibility('open-night')).toBe('public')
  })

  it('returns null when the row is missing, private, or the read fails', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(await getPublicEventLinkVisibility('gone')).toBeNull()
    maybeSingle.mockResolvedValueOnce({ data: { visibility: 'circle_only' }, error: null })
    expect(await getPublicEventLinkVisibility('crew-only')).toBeNull()
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await getPublicEventLinkVisibility('flaky')).toBeNull()
  })
})

describe('the public share page generateMetadata (SCAN-1014)', () => {
  const share = readFileSync(join(process.cwd(), 'app/(public)/events/[slug]/page.tsx'), 'utf8')
  const meta = share.slice(share.indexOf('export async function generateMetadata'))
  const body = sourceWithoutComments(join(process.cwd(), 'app/(public)/events/[slug]/page.tsx'), {
    imports: true,
  })

  it('noindexes an unlisted event and omits its canonical', () => {
    expect(meta.slice(0, 3500)).toMatch(/unlisted/)
    expect(body).toContain("visibility === 'unlisted'")
    expect(body).toContain('UNLISTED_EVENT_ROBOTS')
    expect(body).toContain('unlisted ? {} : { alternates: { canonical:')
  })

  it('does not widen public_event_by_slug for a column the share page can read itself', () => {
    expect(share).not.toContain('drop function')
    expect(body).toContain('getPublicEventLinkVisibility')
  })
})
