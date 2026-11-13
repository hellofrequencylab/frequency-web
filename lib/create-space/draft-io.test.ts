import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// A table of rows keyed by token hash, and a client that answers the four calls draft-io makes on it.
type Row = Record<string, unknown>
const state: { rows: Map<string, Row>; updates: Array<{ patch: Row; where: Row }>; rpc: unknown } = { rows: new Map(), updates: [], rpc: { id: 'lead-1', claim_token: 't' } }

function fakeTable() {
  const where: Row = {}
  const matches = (row: Row) => Object.entries(where).every(([k, v]) => (row[k] ?? null) === v)
  const find = () => [...state.rows.values()].find(matches)
  let op: 'select' | 'update' | 'insert' = 'select'
  let patch: Row = {}
  const chain = {
    select: () => { op = 'select'; return chain },
    update: (p: Row) => { op = 'update'; patch = p; return chain },
    insert: (p: Row) => { op = 'insert'; patch = p; const id = `00000000-0000-4000-8000-${String(state.rows.size + 1).padStart(12, '0')}`; state.rows.set(String(p.token_hash), { ...p, id }); return Promise.resolve({ error: null }) },
    eq: (k: string, v: unknown) => { where[k] = v; return chain },
    is: (k: string, v: unknown) => { where[k] = v; return chain },
    maybeSingle: () => Promise.resolve({ data: find() ?? null, error: null }),
    then: (res: (v: { error: null }) => void) => {
      if (op === 'update') {
        state.updates.push({ patch, where })
        for (const row of state.rows.values()) if (matches(row)) Object.assign(row, patch)
      }
      return Promise.resolve({ error: null }).then(res)
    },
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => fakeTable() }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: async () => ({ data: state.rpc, error: null }) }) }))
vi.mock('@/lib/attribution/server', () => ({ resolveAcquisition: async () => ({}) }))
vi.mock('@/lib/spaces/store', () => ({ isSpaceSlugTaken: async (slug: string) => slug === 'taken' }))
vi.mock('@/lib/analytics/leads', () => ({ recordVerifiedLeadCapture: vi.fn() }))
vi.mock('@/lib/signing-secret', () => ({ signingSecret: () => 'test-secret' }))

import { recordVerifiedLeadCapture } from '@/lib/analytics/leads'
import { emptyDraft } from '@/lib/create-space/builder'
import type { BuilderDraft } from '@/lib/create-space/builder'
import { draftLinkToken, markDraftConverted, readDraftByToken, saveDraft, unsubscribeDrafts } from '@/lib/create-space/draft-io'

const draft = (over: Partial<BuilderDraft> = {}): BuilderDraft => ({
  ...emptyDraft('designer', true),
  name: 'Limewell Studio',
  offer: 'Kitchen and home design.',
  hostName: 'Sam Rivera',
  email: 'Sam@Example.com',
  done: { name: true, offer: true, contact: true, photos: false },
  ...over,
})

beforeEach(() => { vi.mocked(recordVerifiedLeadCapture).mockClear(); state.rows.clear(); state.updates = []; state.rpc = { id: 'lead-1', claim_token: 't' } })

describe('saveDraft (ADR-1933)', () => {
  it('needs an address, and otherwise keeps nothing', async () => {
    expect(await saveDraft({ draft: draft({ email: 'nope' }), token: null, tz: null, ownPhoto: false })).toBeNull()
    expect(state.rows.size).toBe(0)
  })

  it('makes a row with a fresh token the first time, storing its hash and never the token', async () => {
    const r = await saveDraft({ draft: draft(), token: null, tz: 'Europe/Lisbon', ownPhoto: true })
    expect(r).not.toBeNull()
    expect(r!.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(r!.handleTaken).toBe(false)
    const [row] = [...state.rows.values()]
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain(r!.token)
    expect(row.email).toBe('sam@example.com')
    expect(row.tz).toBe('Europe/Lisbon')
    expect(row.step_reached).toBe(3)
    expect(row.signup_lead_id).toBe('lead-1')
    expect(recordVerifiedLeadCapture).toHaveBeenCalledWith('lead-1', 'create_space')
    expect((row.draft as { leadToken: unknown }).leadToken).toBeNull()
  })

  it('updates only the row the token opens, keeping the furthest step', async () => {
    const first = await saveDraft({ draft: draft({ done: { name: true, offer: true, contact: true, photos: true } }), token: null, tz: null, ownPhoto: false })
    const again = await saveDraft({ draft: draft({ offer: 'New sentence.' }), token: first!.token, tz: 'Asia/Tokyo', ownPhoto: false })
    expect(again!.token).toBe(first!.token)
    expect(state.rows.size).toBe(1)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].where.id).toBe([...state.rows.values()][0].id)
    expect(state.updates[0].patch.step_reached).toBe(4)
    expect(state.updates[0].patch.tz).toBe('Asia/Tokyo')
  })

  it('a token that opens nothing gets a new row, not someone else\'s', async () => {
    const r = await saveDraft({ draft: draft(), token: 'stranger-token-xx', tz: null, ownPhoto: false })
    expect(r!.token).not.toBe('stranger-token-xx')
    expect(state.rows.size).toBe(1)
  })

  it('says when the handle is taken, and still saves', async () => {
    const r = await saveDraft({ draft: draft({ slug: 'taken' }), token: null, tz: null, ownPhoto: false })
    expect(r!.handleTaken).toBe(true)
    expect(state.rows.size).toBe(1)
  })

  it('a failed lead capture never fails the save', async () => {
    state.rpc = null
    const r = await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    expect(r).not.toBeNull()
    expect([...state.rows.values()][0].signup_lead_id).toBeUndefined()
    expect(recordVerifiedLeadCapture).not.toHaveBeenCalled()
  })
})

describe('readDraftByToken and markDraftConverted', () => {
  it('reads the draft back with its address and token, and nothing for a bad or unknown token', async () => {
    const r = await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    const json = await readDraftByToken(r!.token)
    expect(json).not.toBeNull()
    const back = JSON.parse(json!) as BuilderDraft
    expect(back.name).toBe('Limewell Studio')
    expect(back.email).toBe('Sam@Example.com')
    expect(back.leadToken).toBe(r!.token)
    expect(await readDraftByToken('bad token')).toBeNull()
    expect(await readDraftByToken('unknown-token-xx')).toBeNull()
  })

  it('a converted draft reads as nothing: the launch owns it', async () => {
    const r = await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    await markDraftConverted(r!.token)
    expect(state.updates.at(-1)?.where).toMatchObject({ converted_at: null })
    expect(typeof state.updates.at(-1)?.patch.converted_at).toBe('string')
    expect(await readDraftByToken(r!.token)).toBeNull()
  })
})

describe('link tokens (the reminder emails)', () => {
  const idOf = () => String([...state.rows.values()][0].id)

  it('is the row id signed, 48 hex chars, and opens the row without the browser token', async () => {
    await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    const link = draftLinkToken(idOf())
    expect(link).toMatch(/^[0-9a-f]{48}$/)
    const back = JSON.parse((await readDraftByToken(link))!) as BuilderDraft
    expect(back.name).toBe('Limewell Studio')
    expect(back.leadToken).toBe(link)
  })

  it('refuses a link whose signature is wrong', async () => {
    await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    const link = draftLinkToken(idOf())
    const forged = link.slice(0, 32) + link.slice(32).replace(/./g, (c) => (c === 'a' ? 'b' : 'a'))
    expect(await readDraftByToken(forged)).toBeNull()
  })

  it('a save with a link token re-keys the row to that browser and hands it a token of its own', async () => {
    await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    const link = draftLinkToken(idOf())
    const r = await saveDraft({ draft: draft({ offer: 'From the link.' }), token: link, tz: null, ownPhoto: false })
    expect(state.rows.size).toBe(1)
    expect(r!.token).not.toBe(link)
    expect(r!.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(typeof state.updates.at(-1)?.patch.token_hash).toBe('string')
    // the link keeps working, and so does the new browser token
    expect(await readDraftByToken(link)).not.toBeNull()
    expect(await readDraftByToken(r!.token)).not.toBeNull()
  })

  it('unsubscribes every draft under the address the link opens', async () => {
    await saveDraft({ draft: draft(), token: null, tz: null, ownPhoto: false })
    await saveDraft({ draft: draft({ name: 'Second Try' }), token: null, tz: null, ownPhoto: false })
    expect(await unsubscribeDrafts(draftLinkToken(idOf()))).toBe(true)
    expect([...state.rows.values()].every((r) => typeof r.unsubscribed_at === 'string')).toBe(true)
    expect(await unsubscribeDrafts('unknown-token-xx')).toBe(false)
  })
})
