import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── The member vCard is a PUBLIC file built from an OPT-IN ─────────────────────────────────────
//
// WHY THIS TEST EXISTS. This is one of three routes that are `public` BY HUMAN ASSERTION in
// scripts/authz-route-ledger.json while reading through the RLS-bypassing admin client (LIVE-030).
// It has no gate at all, by design: the profile QR on a printed card links here, and whoever scans
// it is a stranger holding a phone. Two sentences in that ledger entry carry the whole safety
// argument — it "selects only columns the public profile page already shows", and buildVcf "emits
// ONLY the fields the member opted into". Those are the two assertions below.
//
// The failure they close is a quiet one. `.select(...)` is a string. Widening it to `'*'` — the
// single most natural edit in the world, and one no type would complain about — hands every column
// of `profiles` to a helper that decides what to print, on a response served with
// `Cache-Control: public, max-age=300`, i.e. into shared caches. Nothing would throw and the card
// would still look right. So the test pins the PROJECTION, not just the output: the fence is the
// column list, and a fence is only a fence while it is narrow.

const db = vi.hoisted(() => ({
  tables: [] as string[],
  selects: [] as string[],
  filters: [] as [string, unknown][],
  row: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      db.tables.push(table)
      const builder = {
        select(columns: string) {
          db.selects.push(columns)
          return builder
        },
        eq(column: string, value: unknown) {
          db.filters.push([column, value])
          return builder
        },
        maybeSingle: async () => ({ data: db.row }),
      }
      return builder
    },
  }),
}))

import { GET } from './route'

/** A profile row carrying MORE than the route asked for. Nothing here beyond the projected five
 *  columns may ever appear in a card, and the extra keys are what proves it. */
const PROFILE = (over: Record<string, unknown> = {}) => ({
  display_name: 'Rae Mercer',
  handle: 'rae',
  bio: 'Runs the Tuesday cowork Circle.',
  avatar_url: 'https://cdn.example.com/rae.jpg',
  vcard: { enabled: true, email: 'rae@public.example', phone: null, org: null, title: null, website: null, includeAvatar: true },
  // Never projected, never printable:
  id: '00000000-0000-0000-0000-0000000000aa',
  auth_user_id: 'auth-user-1',
  private_email: 'rae.private@example.com',
  phone: '+15550001111',
  stripe_customer_id: 'cus_SECRET',
  ...over,
})

const call = (handle = 'rae') => GET(new Request(`https://frequencylocal.com/people/${handle}/vcard`), { params: Promise.resolve({ handle }) })

beforeEach(() => {
  db.tables.length = 0
  db.selects.length = 0
  db.filters.length = 0
  db.row = PROFILE()
})

describe('the projection IS the fence', () => {
  it('asks profiles for exactly the five public columns, and never for *', async () => {
    await call()
    expect(db.tables).toEqual(['profiles'])
    expect(db.selects).toHaveLength(1)
    const columns = db.selects[0].split(',').map((c) => c.trim())
    expect(columns.sort()).toEqual(['avatar_url', 'bio', 'display_name', 'handle', 'vcard'])
    expect(db.selects[0]).not.toContain('*')
  })

  it('binds the read to the requested handle and nothing else', async () => {
    await call('someone-else')
    expect(db.filters).toEqual([['handle', 'someone-else']])
  })

  it('cannot print a column it never asked for, even when the row carries one', async () => {
    const vcf = await (await call()).text()
    for (const secret of ['rae.private@example.com', '+15550001111', 'cus_SECRET', 'auth-user-1', '0000000000aa']) {
      expect(vcf, secret).not.toContain(secret)
    }
    expect(vcf).toContain('rae@public.example') // the field she DID opt into
  })
})

describe('the opt-in is the whole permission model', () => {
  it('404s a member who never enabled a card, and says nothing about them in the process', async () => {
    db.row = PROFILE({ vcard: { enabled: false, email: 'rae@public.example', phone: '+15550001111' } })
    const res = await call()
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toBe('No contact card')
    // Not even the display name leaks out of the refusal.
    expect(body).not.toContain('Rae')
    expect(body).not.toContain('rae@public.example')
  })

  it('404s an unknown handle', async () => {
    db.row = null
    const res = await call('nobody')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not found')
  })

  it('omits every field the member left empty rather than filling it from the profile', async () => {
    db.row = PROFILE({ vcard: { enabled: true, email: null, phone: null, org: null, title: null, website: null, includeAvatar: false } })
    const vcf = await (await call()).text()
    expect(vcf).toContain('FN:Rae Mercer')
    expect(vcf).not.toContain('EMAIL')
    expect(vcf).not.toContain('TEL')
    expect(vcf).not.toContain('PHOTO')
  })

  it('never embeds a non-https avatar', async () => {
    db.row = PROFILE({ avatar_url: 'http://cdn.example.com/rae.jpg' })
    expect(await (await call()).text()).not.toContain('PHOTO')
  })
})

describe('a shared-cache response must be identical for every caller', () => {
  it('is publicly cacheable and sets no cookie', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/vcard')
    expect(res.headers.get('Cache-Control')).toContain('public')
    // A per-caller value in a `public, max-age=300` response is a cross-member leak by way of a CDN,
    // so the route must carry nothing caller-specific at all.
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('vary')).toBeNull()
  })

  it('names the download after the stored handle', async () => {
    expect((await call()).headers.get('Content-Disposition')).toBe('attachment; filename="rae.vcf"')
  })
})
