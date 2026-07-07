'use client'

// The dev showcase body: a fixture intake (draft + ledger covering every signal state) run
// through buildReviewModel, rendered by the real ReviewBoard. This is the same model the
// operator console builds, so the dev view faithfully mirrors production visuals.

import { buildReviewModel } from '@/app/(main)/admin/business-seeder/review-model'
import { ReviewBoard } from '@/app/(main)/admin/business-seeder/[id]/review-board'
import type { BusinessProfile, ProvenanceLedger } from '@/lib/importer/schema'

const draft: BusinessProfile = {
  name: 'Encinitas Yoga Collective',
  brandName: 'EYC',
  type: 'business',
  tagline: 'Breathe better, together.',
  about: 'A neighborhood studio in the heart of Encinitas, on the coast.',
  story: 'Founded in 2014 by two friends who wanted a calmer corner of town.',
  contact: {
    address: '1 Coast Highway, Encinitas, CA',
    phone: '(555) 010-2030',
    email: 'hello@eyc.test',
    website: 'eyc.test',
    hours: 'Mon-Fri 6am-9pm\nSat-Sun 8am-6pm',
  },
  rating: { value: '4.9', count: '212' },
  offerings: [
    { title: 'Drop-in class', blurb: 'A single 60-minute session.', price: 25, currency: 'USD', priceModel: 'fixed' },
    { title: 'Monthly unlimited', blurb: 'Every class, all month.', price: 149, currency: 'USD', priceModel: 'from' },
  ],
}

// A ledger that exercises every state:
//  • phone/rating/offering[0].price: verified fact -> GREEN, publishes.
//  • address: inferred, low confidence -> AMBER, WITHHELD (uncleared commercial fact).
//  • hours: contradicted (conf 0) -> RED, blocks Apply.
//  • tagline: generated prose -> AMBER, marked AI copy, WITHHELD until verified.
//  • about: no entry -> hand-supplied, publishes.
//  • offering[1].price: inferred -> AMBER, WITHHELD.
const ledger: ProvenanceLedger = {
  'contact.phone': [{ kind: 'fact', confidence: 0.95, verifiedBy: 'auto', sourceUrl: 'https://eyc.test/contact', snippet: 'Call us at (555) 010-2030 to book.' }],
  'contact.address': [{ kind: 'inferred', confidence: 0.4, snippet: 'Somewhere near the coast highway.' }],
  'contact.hours': [{ kind: 'inferred', confidence: 0, sourceUrl: 'https://maps.example/eyc', snippet: 'Hours listed as closed Sundays here.' }],
  rating: [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', sourceUrl: 'https://reviews.example/eyc', snippet: '4.9 stars across 212 reviews' }],
  tagline: [{ kind: 'generated', confidence: 0.7 }],
  'offerings[0].price': [{ kind: 'fact', confidence: 0.92, verifiedBy: 'auto', sourceUrl: 'https://eyc.test/classes', snippet: 'Drop-in: $25' }],
  'offerings[1].price': [{ kind: 'inferred', confidence: 0.35 }],
}

export function ReviewBoardShowcase() {
  const model = buildReviewModel(draft, ledger)
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Dev showcase</p>
        <h1 className="text-xl font-bold text-text">Business Seeder review board</h1>
        <p className="mt-1 text-sm text-muted">
          A fixture import covering every state. Actions call the gated server actions and no-op without a
          session; the visuals are the same the operator sees.
        </p>
      </div>
      <ReviewBoard intakeId="dev-fixture" initialModel={model} status="review" isDemo appliedSpaceId={null} initialMood="warm" initialImages={[]} initialImagePlan={[]} initialLockHero initialListed={false} />
    </div>
  )
}
