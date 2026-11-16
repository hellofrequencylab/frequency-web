import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMetadata } from './page'

const { readVisibility } = vi.hoisted(() => ({ readVisibility: vi.fn() }))

vi.mock('@/lib/discover', () => ({
  getPublicCircle: async () => ({
    id: 'circle-id',
    slug: 'craft-night',
    name: 'Craft Night',
    city: 'Vista',
    type: 'in_person',
    about: 'Bring a project.',
  }),
}))

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: readVisibility }),
      }),
    }),
  }),
}))

describe('public Circle search metadata', () => {
  beforeEach(() => readVisibility.mockReset())

  it('localizes and canonicals a listed Circle', async () => {
    readVisibility.mockResolvedValue({ data: { unlisted: false } })
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'craft-night' }) })
    expect(metadata.title).toBe('Craft Night in Vista')
    expect(metadata.alternates?.canonical).toBe('/discover/circles/craft-night')
    expect(metadata.robots).toBeUndefined()
  })

  it.each([{ data: { unlisted: true } }, { data: null }])('withholds indexing without confirmed listing', async (result) => {
    readVisibility.mockResolvedValue(result)
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'craft-night' }) })
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates).toBeUndefined()
  })
})
