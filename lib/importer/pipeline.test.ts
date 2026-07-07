import { describe, it, expect, vi, beforeEach } from 'vitest'

// The research orchestrator: harvest -> extract -> verify, walking the status machine and
// enforcing the per-import USD cap, all fail-safe. The store is mocked (in-memory row) and each
// stage is injected, so we assert the orchestration WITHOUT a network / model / DB.

import type { BusinessIntakeRow } from './intake'

// ── In-memory store mock ──────────────────────────────────────────────────────────
const state: { row: BusinessIntakeRow | null } = { row: null }

vi.mock('./store', () => ({
  getIntake: vi.fn(async () => state.row),
  setStatus: vi.fn(async (_id: string, next: BusinessIntakeRow['status'], opts?: { error?: string | null }) => {
    if (state.row) {
      state.row.status = next
      if (opts && 'error' in opts) state.row.error = opts.error ?? null
    }
    return true
  }),
  saveRawSources: vi.fn(async (_id: string, sources: unknown[]) => {
    if (state.row) state.row.rawSources = sources as never
    return true
  }),
  saveDraft: vi.fn(async (_id: string, input: { draft: unknown; ledger: unknown; budgetSpent?: number }) => {
    if (state.row) {
      state.row.draft = input.draft as never
      state.row.ledger = input.ledger as never
      if (typeof input.budgetSpent === 'number') state.row.budgetSpent = input.budgetSpent
    }
    return true
  }),
  markApplied: vi.fn(async () => true),
}))

import { runResearch, editedProsePaths } from './pipeline'
import type { HarvestResult } from './harvest'
import type { VerifyResult } from './verify'
import type { ExtractRunResult } from './extract'
import type { ReframeRunResult } from './reframe/run'
import type { BusinessProfile, ProvenanceLedger } from './schema'

function baseRow(over: Partial<BusinessIntakeRow> = {}): BusinessIntakeRow {
  return {
    id: 'intake-1',
    createdBy: 'op-1',
    mode: 'operator',
    status: 'intake',
    inputs: { websiteUrl: 'https://acme.com', hints: { name: 'Acme' } },
    rawSources: [],
    draft: {},
    ledger: {},
    budgetSpent: 0,
    targetSpaceId: null,
    appliedAt: null,
    error: null,
    createdAt: 't',
    updatedAt: 't',
    ...over,
  }
}

const harvestResult: HarvestResult = {
  sources: [{ id: 's1', kind: 'page', url: 'https://acme.com', fetchedAt: 'now', text: 'Acme at 123 Main.' }],
  media: { heroUrl: 'https://site-media.test/hero.jpg' },
  summary: { pagesFetched: 1, pagesFailed: 0, searches: 0, searchResults: 0, oembeds: 0, imagesCaptured: 1 },
}

const extractResult = (): ExtractRunResult => ({
  draft: { name: 'Acme', type: 'business', contact: { address: '123 Main' } } as BusinessProfile,
  ledger: { 'contact.address': [{ kind: 'fact', confidence: 0.6, snippet: '123 Main', sourceUrl: 'https://acme.com' }] },
  costUsd: 0.2,
})

const verifyResult = (over: Partial<VerifyResult> = {}): VerifyResult => ({
  verifiedDraft: { name: 'Acme', type: 'business', contact: { address: '123 Main' } } as BusinessProfile,
  flags: [],
  blocked: [],
  commercialPolicy: 'allow',
  ledger: { 'contact.address': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', snippet: '123 Main', sourceUrl: 'https://acme.com' }] },
  costUsd: 0.3,
  fieldsVerified: 1,
  ...over,
})

const reframeResult = (over: Partial<ReframeRunResult> = {}): ReframeRunResult => ({
  copy: { tagline: 'A calm place to begin.', about: 'A neighborhood studio.' },
  voice: { ok: true, issues: [] },
  costUsd: 0.05,
  ...over,
})

/** Default injected deps for a happy-path run (harvest/extract/verify/reframe all succeed). */
const happyDeps = () => ({
  harvest: async () => harvestResult,
  extractProfile: async () => extractResult(),
  verify: async () => verifyResult(),
  reframe: async () => reframeResult(),
})

beforeEach(() => {
  state.row = baseRow()
  vi.clearAllMocks()
})

describe('runResearch — orchestration', () => {
  it('walks harvest -> extract -> verify and lands in review', async () => {
    const out = await runResearch('intake-1', {
      deps: {
        harvest: async () => harvestResult,
        extractProfile: async () => extractResult(),
        verify: async () => verifyResult(),
      },
    })
    expect(out.ok).toBe(true)
    expect(out.status).toBe('review')
    expect(state.row?.status).toBe('review')
    // Media folded into the draft.
    expect((state.row?.draft as unknown as BusinessProfile).media?.heroPath).toBe('https://site-media.test/hero.jpg')
    // Budget summed across extract + verify.
    expect(out.budgetSpent).toBeCloseTo(0.5, 5)
    expect(out.verify?.fieldsVerified).toBe(1)
  })

  it('persists the VERIFIED draft + ledger (not the raw extract)', async () => {
    await runResearch('intake-1', {
      deps: {
        harvest: async () => harvestResult,
        extractProfile: async () => extractResult(),
        verify: async () => verifyResult(),
      },
    })
    const ledger = state.row?.ledger as unknown as ProvenanceLedger
    expect(ledger['contact.address'][0].verifiedBy).toBe('auto')
  })

  it('degrades to a flagged name-only draft when extract is unavailable (AI off)', async () => {
    const verifySpy = vi.fn()
    const out = await runResearch('intake-1', {
      deps: {
        harvest: async () => harvestResult,
        extractProfile: async () => null, // AI off / over budget
        verify: verifySpy as never,
      },
    })
    expect(out.ok).toBe(true)
    expect(out.status).toBe('review')
    expect(out.note).toContain('degraded')
    expect((state.row?.draft as unknown as BusinessProfile).name).toBe('Acme') // from the hint, nothing fabricated
    expect((state.row?.draft as unknown as BusinessProfile).contact).toBeUndefined()
    expect(verifySpy).not.toHaveBeenCalled() // no verify when there was nothing extracted
  })

  it('reuses cached raw_sources on a re-run (no new crawl)', async () => {
    state.row = baseRow({ rawSources: harvestResult.sources })
    const harvestSpy = vi.fn(async () => harvestResult)
    await runResearch('intake-1', {
      deps: { harvest: harvestSpy, extractProfile: async () => extractResult(), verify: async () => verifyResult() },
    })
    expect(harvestSpy).not.toHaveBeenCalled() // cache hit
  })

  it('forces a refetch when asked', async () => {
    state.row = baseRow({ rawSources: harvestResult.sources })
    const harvestSpy = vi.fn(async () => harvestResult)
    await runResearch('intake-1', {
      forceRefetch: true,
      deps: { harvest: harvestSpy, extractProfile: async () => extractResult(), verify: async () => verifyResult() },
    })
    expect(harvestSpy).toHaveBeenCalledOnce()
  })

  it('does not re-run an already-applied intake', async () => {
    state.row = baseRow({ status: 'applied' })
    const out = await runResearch('intake-1', {
      deps: { harvest: async () => harvestResult, extractProfile: async () => extractResult(), verify: async () => verifyResult() },
    })
    expect(out.status).toBe('applied')
    expect(out.note).toContain('already applied')
  })

  it('lands in failed with the error when a stage throws hard', async () => {
    const out = await runResearch('intake-1', {
      deps: {
        harvest: async () => {
          throw new Error('boom')
        },
      },
    })
    expect(out.ok).toBe(false)
    expect(out.status).toBe('failed')
    expect(state.row?.status).toBe('failed')
    expect(state.row?.error).toContain('boom')
  })

  it('records a blocked (contradicted) commercial field in the outcome', async () => {
    const out = await runResearch('intake-1', {
      deps: {
        harvest: async () => harvestResult,
        extractProfile: async () => extractResult(),
        verify: async () => verifyResult({ blocked: ['contact.address'], commercialPolicy: 'withhold' }),
      },
    })
    expect(out.verify?.blocked).toContain('contact.address')
    expect(out.verify?.withheld).toBe(true)
  })
})

describe('runResearch — reframe stage (P2)', () => {
  it('folds reframed copy into the draft and tags it kind:generated', async () => {
    const out = await runResearch('intake-1', { deps: happyDeps() })
    expect(out.status).toBe('review')
    expect(out.reframe).toEqual({ ran: true, voiceOk: true })
    const draft = state.row?.draft as unknown as BusinessProfile
    expect(draft.tagline).toBe('A calm place to begin.')
    expect(draft.about).toBe('A neighborhood studio.')
    // Every reframed string is tagged generated in the ledger (prose gate still governs it).
    const ledger = state.row?.ledger as unknown as ProvenanceLedger
    expect(ledger.tagline[0].kind).toBe('generated')
    expect(ledger.tagline[0].verifiedBy).toBeUndefined()
    expect(ledger.about[0].kind).toBe('generated')
  })

  it('reframe grounds on the VERIFIED draft, never the raw extract', async () => {
    // The verifier hands reframe a draft with the address STRIPPED (unverified). Assert reframe was
    // called with that verified subset, not the raw extract that still carried the address.
    const reframeSpy = vi.fn(async (_input: { verified: BusinessProfile; profileId?: string | null }) =>
      reframeResult(),
    )
    await runResearch('intake-1', {
      deps: {
        harvest: async () => harvestResult,
        extractProfile: async () => extractResult(), // raw extract HAS contact.address
        // verify STRIPS the address (it did not clear) from the verified draft:
        verify: async () =>
          verifyResult({ verifiedDraft: { name: 'Acme', type: 'business' } as BusinessProfile }),
        reframe: reframeSpy,
      },
    })
    expect(reframeSpy).toHaveBeenCalledOnce()
    const passed = reframeSpy.mock.calls[0][0]
    expect(passed.verified.contact).toBeUndefined() // reframe never saw the unverified address
  })

  it('is fail-safe: a null reframe leaves the verified draft unchanged', async () => {
    const out = await runResearch('intake-1', {
      deps: { ...happyDeps(), reframe: async () => null },
    })
    expect(out.status).toBe('review')
    expect(out.reframe).toBeUndefined()
    const draft = state.row?.draft as unknown as BusinessProfile
    expect(draft.tagline).toBeUndefined() // nothing fabricated
  })

  it('flags amber (voiceOk false) when the copy fails the voice check', async () => {
    const out = await runResearch('intake-1', {
      deps: { ...happyDeps(), reframe: async () => reframeResult({ voice: { ok: false, issues: [{ kind: 'hype', match: 'unlock' }] } }) },
    })
    expect(out.reframe).toEqual({ ran: true, voiceOk: false })
    expect(out.note).toContain('flagged for a voice edit')
  })

  it('does not reframe when extract was unavailable (nothing verified to voice)', async () => {
    const reframeSpy = vi.fn()
    await runResearch('intake-1', {
      deps: { ...happyDeps(), extractProfile: async () => null, reframe: reframeSpy as never },
    })
    expect(reframeSpy).not.toHaveBeenCalled()
  })

  it('edit-wins: a prose field the operator edited is not clobbered by reframe', async () => {
    // A prior review edited `about` and marked it in the draft's _editedProse marker.
    state.row = baseRow({ draft: { about: 'Operator edited about.', _editedProse: ['about'] } })
    await runResearch('intake-1', { deps: happyDeps() })
    const draft = state.row?.draft as unknown as BusinessProfile & { _editedProse?: string[] }
    // reframe wanted to write "A neighborhood studio." but the operator edit wins.
    expect(draft.about).toBe('Operator edited about.')
    expect(draft.tagline).toBe('A calm place to begin.') // a non-preserved field is still voiced
  })
})

describe('editedProsePaths — the edit-wins marker reader', () => {
  it('reads a string[] under _editedProse', () => {
    expect(editedProsePaths({ _editedProse: ['about', 'tagline'] })).toEqual(new Set(['about', 'tagline']))
  })
  it('is empty for a missing / malformed marker', () => {
    expect(editedProsePaths(undefined).size).toBe(0)
    expect(editedProsePaths({}).size).toBe(0)
    expect(editedProsePaths({ _editedProse: 'nope' }).size).toBe(0)
    expect(editedProsePaths({ _editedProse: [1, 'about'] })).toEqual(new Set(['about']))
  })
})
