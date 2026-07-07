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

import { runResearch } from './pipeline'
import type { HarvestResult } from './harvest'
import type { VerifyResult } from './verify'
import type { ExtractRunResult } from './extract'
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
