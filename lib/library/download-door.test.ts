import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-578 (ADR-1596): the Loom download door. These lock its consequences: the policy is applied to
// the caller (open, members, staff), an expired license and a missing file are refused, a protected
// original is handed out only as a ONE-MINUTE signed attachment, the record is written BEFORE the
// redirect, and a download that cannot be recorded is refused.

type Row = Record<string, unknown>
const state: {
  asset: Row | null
  inserts: Row[]
  insertError: { message: string } | null
  signed: Array<{ bucket: string; path: string; ttl: number; opts: unknown }>
  signFails: boolean
  order: string[]
} = { asset: null, inserts: [], insertError: null, signed: [], signFails: false, order: [] }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'library_assets') {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: state.asset, error: null }),
        }
        return q
      }
      if (table === 'library_downloads') {
        return {
          insert: async (row: Row) => {
            state.order.push('record')
            if (state.insertError) return { error: state.insertError }
            state.inserts.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number, opts?: unknown) => {
          state.order.push('sign')
          state.signed.push({ bucket, path, ttl, opts })
          if (state.signFails) return { data: null, error: { message: 'nope' } }
          return { data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null }
        },
      }),
    },
  }),
}))

const staffIds = new Set<string>()
vi.mock('@/lib/admin/guard', () => ({
  authorizeAction: async (caller: { id: string } | null) => {
    if (caller && staffIds.has(caller.id)) return caller
    throw new Error('Unauthorized')
  },
}))

const {
  openLibraryDownload,
  admitDownload,
  effectiveDownloadPolicy,
  downloadFilename,
  publicDownloadUrl,
  readDoorPolicy,
  DOWNLOAD_REFUSAL,
  LIBRARY_DOWNLOAD_TTL_SECONDS,
} = await import('./download-door')

const ID = '00000000-0000-4000-a578-000000000001'
const PUB = 'https://x.supabase.co/storage/v1/object/public/library-media/root/sunrise.jpg'
const member = { id: 'p-member', community_role: 'member', webRole: 'none' } as never
const staff = { id: 'p-staff', community_role: 'member', webRole: 'janitor' } as never

function asset(over: Row = {}): Row {
  return {
    id: ID,
    kind: 'image',
    slug: 'sunrise',
    url: PUB,
    mime: 'image/jpeg',
    storage_path: 'root/sunrise.jpg',
    is_protected: false,
    download_policy: 'open',
    expires_at: null,
    ...over,
  }
}
const protectedAsset = (policy: string) =>
  asset({ url: null, is_protected: true, download_policy: policy, storage_bucket: 'library-private' })

beforeEach(() => {
  state.asset = null
  state.inserts = []
  state.insertError = null
  state.signed = []
  state.signFails = false
  state.order = []
  staffIds.clear()
  staffIds.add('p-staff')
})

describe('openLibraryDownload: the policy is applied to the caller', () => {
  it('open: a signed-out visitor who reached the link gets the file, as an attachment, and a row with no profile', async () => {
    state.asset = asset()
    const out = await openLibraryDownload(ID, null)
    expect(out).toEqual({ ok: true, location: `${PUB}?download=sunrise.jpg` })
    expect(state.inserts).toEqual([{ asset_id: ID, profile_id: null, policy: 'open' }])
  })

  it('members: a signed-out visitor is refused and nothing is written', async () => {
    state.asset = protectedAsset('members')
    expect(await openLibraryDownload(ID, null)).toEqual({ ok: false, refusal: 'members' })
    expect(state.inserts).toEqual([])
    expect(state.signed).toEqual([])
  })

  it('members: a signed-in member gets the protected original as a one-minute signed attachment', async () => {
    state.asset = protectedAsset('members')
    const out = await openLibraryDownload(ID, member)
    if (!out.ok) throw new Error('expected a download')
    expect(out.location).toContain('/object/sign/library-private/root/sunrise.jpg')
    expect(state.signed).toEqual([
      { bucket: 'library-private', path: 'root/sunrise.jpg', ttl: 60, opts: { download: 'sunrise.jpg' } },
    ])
    expect(state.inserts).toEqual([{ asset_id: ID, profile_id: 'p-member', policy: 'members' }])
  })

  it('staff: a member who is not on the Loom team is refused, and nothing is signed or written', async () => {
    state.asset = protectedAsset('staff')
    expect(await openLibraryDownload(ID, member)).toEqual({ ok: false, refusal: 'staff' })
    expect(state.signed).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('staff: the Loom team gets it', async () => {
    state.asset = protectedAsset('staff')
    const out = await openLibraryDownload(ID, staff)
    expect(out.ok).toBe(true)
    expect(state.inserts).toEqual([{ asset_id: ID, profile_id: 'p-staff', policy: 'staff' }])
  })
})

describe('openLibraryDownload: a protected asset left on the default open policy (SCAN-652, ruling b)', () => {
  it('refuses a signed-out visitor and a member, and signs nothing', async () => {
    state.asset = protectedAsset('open')
    expect(await openLibraryDownload(ID, null)).toEqual({ ok: false, refusal: 'members' })
    expect(await openLibraryDownload(ID, member)).toEqual({ ok: false, refusal: 'staff' })
    expect(state.signed).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('lets the Loom team through and records the policy the door applied, staff, not the stored open', async () => {
    state.asset = protectedAsset('open')
    const out = await openLibraryDownload(ID, staff)
    expect(out.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ asset_id: ID, profile_id: 'p-staff', policy: 'staff' })
  })

  it('an unprotected asset on open is still open to anyone', async () => {
    state.asset = asset({ download_policy: 'open' })
    expect((await openLibraryDownload(ID, null)).ok).toBe(true)
  })
})

describe('openLibraryDownload: the record and the refusals', () => {
  it('writes the record after the mint and before answering; a failed write refuses the download', async () => {
    state.asset = protectedAsset('members')
    state.insertError = { message: 'db down' }
    expect(await openLibraryDownload(ID, member)).toEqual({ ok: false, refusal: 'unrecorded' })
    expect(state.order).toEqual(['sign', 'record'])
  })

  it('never signs for longer than a minute', async () => {
    state.asset = protectedAsset('members')
    await openLibraryDownload(ID, member)
    expect(LIBRARY_DOWNLOAD_TTL_SECONDS).toBe(60)
    expect(state.signed.every((s) => s.ttl <= 60)).toBe(true)
  })

  it('refuses an expired license for everyone, staff included', async () => {
    state.asset = asset({ expires_at: '2026-01-01T00:00:00.000Z' })
    expect(await openLibraryDownload(ID, staff, { now: new Date('2026-09-29T00:00:00Z') })).toEqual({
      ok: false,
      refusal: 'expired',
    })
    expect(state.inserts).toEqual([])
  })

  it('refuses a missing row, a malformed id, and a row with no file', async () => {
    expect(await openLibraryDownload(ID, staff)).toEqual({ ok: false, refusal: 'missing' })
    expect(await openLibraryDownload('not-a-uuid', staff)).toEqual({ ok: false, refusal: 'missing' })
    state.asset = asset({ kind: 'element', url: null, storage_path: null })
    expect(await openLibraryDownload(ID, staff)).toEqual({ ok: false, refusal: 'missing' })
    expect(state.inserts).toEqual([])
  })

  it('a mint that fails is refused and not recorded', async () => {
    state.asset = protectedAsset('members')
    state.signFails = true
    expect(await openLibraryDownload(ID, member)).toEqual({ ok: false, refusal: 'unavailable' })
    expect(state.inserts).toEqual([])
  })

  it('every refusal carries a status and a sentence with no em dash', () => {
    for (const r of Object.values(DOWNLOAD_REFUSAL)) {
      expect(r.status).toBeGreaterThanOrEqual(400)
      expect(r.message).not.toMatch(/—/)
      expect(r.message.endsWith('.')).toBe(true)
    }
  })
})

describe('the pure pieces', () => {
  it('admitDownload asks the staff gate only for a staff asset', async () => {
    const gate = vi.fn(async () => false)
    expect(await admitDownload('open', null, gate)).toBeNull()
    expect(await admitDownload('members', member, gate)).toBeNull()
    expect(gate).not.toHaveBeenCalled()
    expect(await admitDownload('staff', member, gate)).toBe('staff')
    expect(await admitDownload('staff', null, gate)).toBe('members')
  })

  it('effectiveDownloadPolicy tightens only the protected-and-default case', () => {
    expect(effectiveDownloadPolicy({ isProtected: true, downloadPolicy: 'open' })).toBe('staff')
    expect(effectiveDownloadPolicy({ isProtected: true, downloadPolicy: 'members' })).toBe('members')
    expect(effectiveDownloadPolicy({ isProtected: true, downloadPolicy: 'staff' })).toBe('staff')
    expect(effectiveDownloadPolicy({ isProtected: false, downloadPolicy: 'open' })).toBe('open')
  })

  it('an unknown stored policy reads as the strictest one at the door', () => {
    expect(readDoorPolicy('open')).toBe('open')
    expect(readDoorPolicy('members')).toBe('members')
    expect(readDoorPolicy('weird')).toBe('staff')
    expect(readDoorPolicy(null)).toBe('staff')
  })

  it('downloadFilename names the attachment from the slug and mime, with nothing a header can trip on', () => {
    expect(downloadFilename({ slug: 'sunrise', mime: 'image/jpeg' })).toBe('sunrise.jpg')
    expect(downloadFilename({ slug: 'a "b"\r\nc', mime: 'image/png' })).toBe('a-b-c.png')
    expect(downloadFilename({ slug: '', mime: null })).toBe('loom-file.img')
  })

  it('publicDownloadUrl adds the attachment flag to a storage url only', () => {
    expect(publicDownloadUrl(PUB, 'x.jpg')).toBe(`${PUB}?download=x.jpg`)
    expect(publicDownloadUrl('https://images.example.com/a.jpg', 'x.jpg')).toBe('https://images.example.com/a.jpg')
  })
})
