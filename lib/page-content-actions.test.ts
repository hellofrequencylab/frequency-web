import { describe, it, expect, vi, beforeEach } from 'vitest'

// The seams: who is calling, the database, and Next's cache. Everything else — the route guard,
// the field trims, the site-rung rule — is the real code path the editor takes (PROG-P6, ADR-1284).
const caller = vi.fn()
vi.mock('@/lib/auth', () => ({ getCallerProfile: () => caller() }))
const upsert = vi.fn()
const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (row: unknown) => upsert(row),
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }),
    }),
  }),
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const { getEditablePageContent, savePageContent, setPageHeroUrl, removePageHero } = await import('./page-content-actions')
const { SITE_SCOPE } = await import('@/lib/layout/editable-content')

const admin = { id: 'admin-1', community_role: 'admin' }
const member = { id: 'member-1', community_role: 'member' }

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  upsert.mockResolvedValue({ error: null })
  maybeSingle.mockResolvedValue({ data: null })
})

describe("the site rung '*' is writable, under the same gate as a page row (PROG-P6 (b))", () => {
  it('an admin can save the site row, and its title and description are nulled at the write', async () => {
    caller.mockResolvedValue(admin)
    const r = await savePageContent(
      SITE_SCOPE,
      form({ title: 'Never stored', description: 'Never stored', body: 'Site intro', cta_label: 'Join', cta_href: '/join' }),
    )
    expect(r).toEqual({ data: undefined })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toMatchObject({
      route: SITE_SCOPE,
      title: null,
      description: null,
      body: 'Site intro',
      cta_label: 'Join',
      cta_href: '/join',
      updated_by: 'admin-1',
    })
  })

  it("saving the site row refreshes the root layout's subtree, not a path that does not exist", async () => {
    caller.mockResolvedValue(admin)
    await savePageContent(SITE_SCOPE, form({ body: 'Site intro' }))
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(revalidatePath).not.toHaveBeenCalledWith(SITE_SCOPE)
  })

  it('the hero writers take the site rung too', async () => {
    caller.mockResolvedValue(admin)
    const url = 'https://x.supabase.co/storage/v1/object/public/loom/site.jpg'
    expect(await setPageHeroUrl(SITE_SCOPE, url)).toBeUndefined()
    expect(upsert.mock.calls[0][0]).toMatchObject({ route: SITE_SCOPE, hero_image: url })
    await removePageHero(SITE_SCOPE)
    expect(upsert.mock.calls[1][0]).toMatchObject({ route: SITE_SCOPE, hero_image: null })
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenLastCalledWith('/', 'layout')
  })

  it('the site row reads back through the same editor read', async () => {
    caller.mockResolvedValue(admin)
    maybeSingle.mockResolvedValue({ data: { route: SITE_SCOPE, body: 'Site intro', hero_image: '/site.jpg' } })
    expect(await getEditablePageContent(SITE_SCOPE)).toEqual({
      title: '',
      description: '',
      body: 'Site intro',
      heroImage: '/site.jpg',
      ctaLabel: '',
      ctaHref: '',
    })
  })

  it('below admin, the site row is exactly as closed as a page row', async () => {
    caller.mockResolvedValue(member)
    expect(await savePageContent(SITE_SCOPE, form({ body: 'x' }))).toEqual({ error: 'Not allowed.' })
    expect(await savePageContent('/events', form({ body: 'x' }))).toEqual({ error: 'Not allowed.' })
    expect(await getEditablePageContent(SITE_SCOPE)).toBeNull()
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('a page row keeps its own identity and its own refresh', () => {
  it('a registered route stores title, description AND body, and refreshes that route', async () => {
    caller.mockResolvedValue(admin)
    const r = await savePageContent('/events', form({ title: 'Events', description: 'What is on', body: 'Page intro' }))
    expect(r).toEqual({ data: undefined })
    expect(upsert.mock.calls[0][0]).toMatchObject({
      route: '/events',
      title: 'Events',
      description: 'What is on',
      body: 'Page intro',
      cta_label: null,
      cta_href: null,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/events')
  })

  it('a blank body clears the override so the cascade walks on to the section or site', async () => {
    caller.mockResolvedValue(admin)
    await savePageContent('/events', form({ body: '   ' }))
    expect(upsert.mock.calls[0][0]).toMatchObject({ body: null })
  })

  it('a route outside the registry is still refused, so the site rung did not widen the door', async () => {
    caller.mockResolvedValue(admin)
    expect(await savePageContent('/not-registered', form({ body: 'x' }))).toMatchObject({ error: expect.any(String) })
    expect(await savePageContent('**', form({ body: 'x' }))).toMatchObject({ error: expect.any(String) })
    expect(await getEditablePageContent('/not-registered')).toBeNull()
    expect(upsert).not.toHaveBeenCalled()
  })
})
