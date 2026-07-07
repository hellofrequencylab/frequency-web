import { describe, it, expect, vi, beforeEach } from 'vitest'

// REFRAME (P2, docs §5). The trust-critical properties this suite pins:
//  1. Reframe grounds ONLY on the verified subset it is passed: a withheld / unverified commercial
//     fact NEVER appears in the grounding block, so it cannot be laundered into prose.
//  2. Every string reframe writes is tagged kind:'generated' in the ledger, so the prose gate still
//     governs it (a commercial claim inside generated copy does not auto-publish as trusted).
//  3. The prose gate withholds a commercial claim embedded in generated copy.
//  4. Edit-wins: a re-reframe never clobbers a field an operator already edited.
//  5. The §10 voice check regenerates once, then flags; em dashes never survive.
// The LLM is mocked; no network.

// ── Mock the AI seam so reframe() runs without a model ─────────────────────────────
const completeRawMock = vi.fn()
vi.mock('@/lib/ai/complete', () => ({
  completeRaw: (...args: unknown[]) => completeRawMock(...args),
}))
vi.mock('@/lib/ai/client', () => ({ aiEnabled: () => true }))
vi.mock('@/lib/ai/usage', () => ({
  recordAiUsage: vi.fn(),
  featureOverBudget: vi.fn(async () => false),
}))

import { buildGroundingBlock, REFRAME_TOOL_NAME } from './prompt'
import { coerceReframe, joinReframeCopy, reframe } from './run'
import { applyReframe, generatedEntry, offeringBlurbPath } from './apply'
import { prosePublishes, mapProfileData, mapIdentity } from '../map'
import type { BusinessProfile, ProvenanceLedger } from '../schema'

/** A tool_use response the mocked completeRaw returns. */
function toolResponse(input: unknown) {
  return {
    tier: 'sonnet',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'tool_use', name: REFRAME_TOOL_NAME, id: 't1', input }],
    text: '',
    usage: { inputTokens: 10, outputTokens: 10 },
    costUsd: 0.01,
  }
}

const verifiedDraft = (): BusinessProfile => ({
  name: 'Still Water Wellness',
  type: 'business',
  category: 'Wellness studio',
  about: 'A neighborhood studio for yoga and breathwork.',
  offerings: [{ title: 'Drop-in class' }, { title: 'Private session' }],
})

beforeEach(() => {
  completeRawMock.mockReset()
})

describe('buildGroundingBlock — grounds ONLY on the verified subset', () => {
  it('never prints an unverified commercial fact that verify stripped', () => {
    // The verifier hands reframe a draft with NO phone / address / price (they were stripped as
    // unverified). The grounding block must not contain them.
    const g = buildGroundingBlock(verifiedDraft())
    expect(g).toContain('Still Water Wellness')
    expect(g).not.toMatch(/\$\d/) // no price
    expect(g).not.toMatch(/\d{3}[.\- ]\d{3}[.\- ]\d{4}/) // no phone number
    expect(g).not.toMatch(/\d+ \w+ (St|Street|Ave|Avenue)/i) // no street address
  })

  it('mentions a fact EXISTS by label only, never quotes the figure', () => {
    const draft = verifiedDraft()
    draft.contact = { phone: '(503) 555-0142', address: '12 Oak St' }
    draft.offerings = [{ title: 'Class', price: 25 }]
    const g = buildGroundingBlock(draft)
    // The label is present so the model does not deny the fact exists...
    expect(g).toContain('a way to get in touch')
    expect(g).toContain('published prices')
    // ...but the actual phone / address / price is NOT in the grounding.
    expect(g).not.toContain('555-0142')
    expect(g).not.toContain('12 Oak St')
    expect(g).not.toContain('$25')
    expect(g).not.toMatch(/(^|[^0-9])25([^0-9]|$)/)
  })
})

describe('coerceReframe — fail safe on garbage', () => {
  it('keeps well-formed strings, drops junk', () => {
    const out = coerceReframe({
      tagline: '  Quiet mornings.  ',
      about: 'A studio.',
      story: '',
      offeringBlurbs: [
        { index: 0, blurb: 'Drop in anytime.' },
        { index: -1, blurb: 'bad' },
        { index: 1 }, // no blurb
        'garbage',
      ],
    })
    expect(out.tagline).toBe('Quiet mornings.')
    expect(out.about).toBe('A studio.')
    expect(out.story).toBeUndefined() // empty dropped
    expect(out.offeringBlurbs).toEqual([{ index: 0, blurb: 'Drop in anytime.' }])
  })

  it('returns an empty object for total garbage', () => {
    expect(coerceReframe(null)).toEqual({})
    expect(coerceReframe({ tagline: 42 })).toEqual({})
  })
})

describe('applyReframe — every generated string is tagged kind:generated', () => {
  it('tags tagline / about / story generated, no source, no verification', () => {
    const { draft, ledger } = applyReframe(
      verifiedDraft(),
      { tagline: 'Come as you are.', about: 'A quiet studio.', story: 'We started small.' },
      {},
    )
    expect(draft.tagline).toBe('Come as you are.')
    for (const path of ['tagline', 'about', 'story']) {
      expect(ledger[path][0].kind).toBe('generated')
      expect(ledger[path][0].verifiedBy).toBeUndefined()
      expect(ledger[path][0].sourceUrl).toBeUndefined()
    }
  })

  it('tags an offering blurb generated at offerings[i].blurb', () => {
    const { draft, ledger } = applyReframe(
      verifiedDraft(),
      { offeringBlurbs: [{ index: 0, blurb: 'Drop in anytime.' }] },
      {},
    )
    expect(draft.offerings?.[0].blurb).toBe('Drop in anytime.')
    expect(ledger[offeringBlurbPath(0)][0].kind).toBe('generated')
  })

  it('strips em dashes from every folded string', () => {
    const { draft } = applyReframe(verifiedDraft(), { about: 'Calm mornings — steady evenings' }, {})
    expect(draft.about).not.toMatch(/[—―]/)
    expect(draft.about).toBe('Calm mornings, steady evenings')
  })

  it('honors edit-wins: a preserved path is not overwritten', () => {
    const base = verifiedDraft()
    base.about = 'Operator edited this.'
    const { draft, ledger } = applyReframe(
      base,
      { about: 'AI wants to replace it.', story: 'New story.' },
      { about: [{ kind: 'human' as never, confidence: 1 }] } as ProvenanceLedger,
      new Set(['about']),
    )
    expect(draft.about).toBe('Operator edited this.') // human edit kept
    expect(draft.story).toBe('New story.') // non-preserved field still reframed
    expect(ledger.story[0].kind).toBe('generated')
  })

  it('never mutates the inputs', () => {
    const base = verifiedDraft()
    const ledger: ProvenanceLedger = {}
    applyReframe(base, { about: 'x' }, ledger)
    expect(base.about).toBe('A neighborhood studio for yoga and breathwork.')
    expect(ledger).toEqual({})
  })
})

describe('the prose gate withholds a commercial claim hidden in generated copy', () => {
  it('a generated about that hides a price is WITHHELD under a ledger policy', () => {
    // Reframe writes an about that (wrongly) contains a price. It is tagged generated. The prose gate
    // (map.ts) must withhold it: an unverified commercial claim inside generated prose never publishes.
    const { draft, ledger } = applyReframe(
      verifiedDraft(),
      { about: 'Massages from $95. Come in.' },
      {},
    )
    const policy = { mode: 'ledger' as const, ledger }
    // The prose is generated (not a verified fact), so it does not publish.
    expect(prosePublishes(policy, 'about')).toBe(false)
    const pd = mapProfileData(draft, policy)
    expect(pd.about).toBeUndefined() // withheld from the live surface
    const identity = mapIdentity(draft, { slug: 'x', accent: null }, policy)
    expect(identity.about).toBeNull()
  })

  it('a hand-supplied about (no ledger entry) DOES publish', () => {
    // A field the importer never generated (no ledger entry) is trusted (hand-supplied).
    const draft = verifiedDraft()
    draft.about = 'Hand written by the operator.'
    const policy = { mode: 'ledger' as const, ledger: {} as ProvenanceLedger }
    expect(prosePublishes(policy, 'about')).toBe(true)
    expect(mapProfileData(draft, policy).about).toBe('Hand written by the operator.')
  })
})

describe('reframe() — the LLM run (mocked model)', () => {
  it('returns copy and the pipeline can fold it as generated', async () => {
    completeRawMock.mockResolvedValueOnce(
      toolResponse({ tagline: 'Come as you are.', about: 'A quiet studio.' }),
    )
    const res = await reframe({ verified: verifiedDraft(), profileId: 'op-1' })
    expect(res).not.toBeNull()
    expect(res!.copy.tagline).toBe('Come as you are.')
    expect(res!.voice.ok).toBe(true)
    expect(res!.costUsd).toBeCloseTo(0.01, 5)
    // Folding it tags generated.
    const { ledger } = applyReframe(verifiedDraft(), res!.copy, {})
    expect(ledger.tagline[0].kind).toBe('generated')
  })

  it('regenerates once when the first draft fails the voice check, keeps the cleaner one', async () => {
    completeRawMock
      .mockResolvedValueOnce(toolResponse({ tagline: 'Unlock your best life!' })) // hype -> fails
      .mockResolvedValueOnce(toolResponse({ tagline: 'A calm place to begin.' })) // clean
    const res = await reframe({ verified: verifiedDraft(), profileId: 'op-1' })
    expect(completeRawMock).toHaveBeenCalledTimes(2)
    expect(res!.copy.tagline).toBe('A calm place to begin.')
    expect(res!.voice.ok).toBe(true)
    expect(res!.costUsd).toBeCloseTo(0.02, 5) // both calls billed
  })

  it('keeps the first (flagged) copy when the retry is no cleaner, and reports voice not ok', async () => {
    completeRawMock
      .mockResolvedValueOnce(toolResponse({ tagline: 'Elevate your journey!' }))
      .mockResolvedValueOnce(toolResponse({ tagline: 'Supercharge your tribe!' }))
    const res = await reframe({ verified: verifiedDraft(), profileId: 'op-1' })
    expect(res!.voice.ok).toBe(false) // pipeline flags it amber
  })

  it('returns null (no fabricated prose) when the model returns no tool block', async () => {
    completeRawMock.mockResolvedValueOnce({
      tier: 'sonnet',
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: 'nope' }],
      text: 'nope',
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0.01,
    })
    expect(await reframe({ verified: verifiedDraft() })).toBeNull()
  })

  it('joinReframeCopy concatenates every generated string for the check', () => {
    const joined = joinReframeCopy({
      tagline: 'a',
      about: 'b',
      story: 'c',
      offeringBlurbs: [{ index: 0, blurb: 'd' }],
    })
    expect(joined).toBe('a\nb\nc\nd')
  })
})

describe('generatedEntry — the review-required shape', () => {
  it('is generated, unverified, sourceless', () => {
    const e = generatedEntry()
    expect(e.kind).toBe('generated')
    expect(e.verifiedBy).toBeUndefined()
    expect(e.sourceUrl).toBeUndefined()
  })
})
