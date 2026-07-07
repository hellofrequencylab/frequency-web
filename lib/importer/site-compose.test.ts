import { describe, it, expect } from 'vitest'
import { composeSiteHomeDoc } from './site-compose'
import type { BusinessProfile, ProvenanceLedger } from './schema'

// The Site (website) surface composer (P2, docs §5). Pure; no DB, no AI. Confirms the reframed
// prose reaches the /sites/[slug] Puck doc AND that the same prose gate withholds unverified copy.

const draft = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
  name: 'Still Water Wellness',
  type: 'business',
  about: 'A neighborhood studio for yoga and breathwork.',
  story: 'We started in a spare room and grew from there.',
  offerings: [{ title: 'Drop-in class', blurb: 'Come as you are.' }],
  ...over,
})

/** Find a block by type in the composed Site doc. */
function block(doc: ReturnType<typeof composeSiteHomeDoc>, type: string) {
  return doc.content.find((b) => b.type === type)
}

describe('composeSiteHomeDoc — the reframed prose reaches the Site', () => {
  it('is a renderable Puck doc with the default block set', () => {
    const doc = composeSiteHomeDoc(draft(), 'allow')
    expect(Array.isArray(doc.content)).toBe(true)
    // The live-data blocks are present so they self-fill from profileData on the Site.
    for (const t of ['SpaceOfferings', 'SpaceContact', 'SpaceReviews', 'SpaceFAQ', 'SpaceBusiness']) {
      expect(block(doc, t)).toBeTruthy()
    }
  })

  it('folds the reframed story into the SpaceAbout body under allow', () => {
    const doc = composeSiteHomeDoc(draft(), 'allow')
    const about = block(doc, 'SpaceAbout')
    expect((about!.props as { body: string }).body).toBe('We started in a spare room and grew from there.')
  })

  it('falls back to the about line when there is no story', () => {
    const doc = composeSiteHomeDoc(draft({ story: undefined }), 'allow')
    expect((block(doc, 'SpaceAbout')!.props as { body: string }).body).toBe(
      'A neighborhood studio for yoga and breathwork.',
    )
  })

  it('keeps the generic closing SpaceCallout (a relational CTA, not gated prose)', () => {
    const doc = composeSiteHomeDoc(draft(), 'allow')
    // The callout is a relational invitation with no commercial claim; it keeps its default CTA.
    expect(block(doc, 'SpaceCallout')).toBeTruthy()
    expect((block(doc, 'SpaceCallout')!.props as { heading: string }).heading).toBe('Come say hello')
  })

  it('never emits an identity header block (owned by the Site shell)', () => {
    const doc = composeSiteHomeDoc(draft(), 'allow')
    expect(block(doc, 'SpaceIdentityHeader')).toBeUndefined()
  })
})

describe('composeSiteHomeDoc — the prose gate governs the Site too', () => {
  it('withholds generated about + story on the Site under a ledger policy', () => {
    // Both about and story are AI-generated (tagged generated) and unverified: they must be withheld
    // from the Site, exactly as they are withheld from the Space profile.
    const ledger: ProvenanceLedger = {
      about: [{ kind: 'generated', confidence: 0.5 }],
      story: [{ kind: 'generated', confidence: 0.5 }],
    }
    const doc = composeSiteHomeDoc(draft(), { mode: 'ledger', ledger })
    expect((block(doc, 'SpaceAbout')!.props as { body: string }).body).toBe('') // withheld -> empty -> renders nothing
  })

  it('publishes a hand-supplied about (no ledger entry) on the Site', () => {
    const doc = composeSiteHomeDoc(draft({ story: undefined }), { mode: 'ledger', ledger: {} })
    expect((block(doc, 'SpaceAbout')!.props as { body: string }).body).toBe(
      'A neighborhood studio for yoga and breathwork.',
    )
  })

  it('publishes a verified-fact story on the Site (the verified path is live)', () => {
    const ledger: ProvenanceLedger = {
      story: [{ kind: 'fact', confidence: 0.9, verifiedBy: 'human', snippet: 'x' }],
    }
    const doc = composeSiteHomeDoc(draft(), { mode: 'ledger', ledger })
    expect((block(doc, 'SpaceAbout')!.props as { body: string }).body).toBe(
      'We started in a spare room and grew from there.',
    )
  })

  it('withholds all prose under a blanket withhold policy', () => {
    const doc = composeSiteHomeDoc(draft(), 'withhold')
    expect((block(doc, 'SpaceAbout')!.props as { body: string }).body).toBe('')
  })
})
