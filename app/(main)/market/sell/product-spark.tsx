'use client'

// The "List a product" Spark (docs/STUDIO.md §0, ADR-986). Replaces the plain <form action> that used
// to live in sell-form.tsx. Everything on screen is derived: the fields come from PRODUCT_MANIFEST
// (lib/studio/entities/product.ts) through the Spark kit, so adding or changing one is a manifest edit,
// not an edit here.
//
// This island owns only what is genuinely this surface's business: the seed values a member's own
// listing starts from, the seed handed to Vera, and the call to the EXISTING server action. Listing is
// open on the free tier (ADR-914); the page and the action both ask only that you are signed in.
//
// GETTING PAID is offered here, not described (LIVE-537). The page resolves the one Connect prompt
// (lib/billing/payout-prompt.ts) for the maker and this Spark renders its card on the first screen,
// which starts Stripe hosted onboarding inline and is null once the maker is ready. The two go-elsewhere
// sentences this file used to carry (telling a maker to set up payouts ahead of a sale, with nothing to
// press) were the dead end LIVE-233 retired from every other money path.
//
// The Loom scope is deliberately left undefined: a member listing their own piece should see their own
// Loom plus every Space they run, which is what the picker does with no scopeKey.

import Link from 'next/link'
import { ArrowUpRight, Store } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { PayoutPromptCard } from '@/components/billing/payout-prompt-card'
import type { PayoutPrompt } from '@/lib/billing/payout-prompt'
import { CommerceSpark, type SparkDraft } from '@/components/studio/commerce/commerce-spark'
import { PRODUCT_MANIFEST } from '@/lib/studio/entities/product'
import { createMakerProductAction, draftMakerProductCopyAction } from '../../marketplace/commerce-actions'
import { UpgradeMoment } from '@/components/pricing/upgrade-moment'
import type { UpgradeOffer } from '@/lib/pricing/business-offer'

/** Read a scalar off the draft as text. */
function text(draft: SparkDraft, key: string): string {
  const v = draft[key]
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)
}

export function ProductSpark({
  payoutPrompt,
  upgradeOffer,
}: {
  payoutPrompt: PayoutPrompt | null
  /** The Business offer for the upgrade moment (LIVE-758). A personal listing with a price is an
   *  inquiry (LIVE-753), so a price typed here opens the panel; absent hides it. */
  upgradeOffer?: UpgradeOffer
}) {
  return (
    <CommerceSpark
      manifest={PRODUCT_MANIFEST}
      eyebrow="List a product"
      doors={{
        title: 'What are you selling?',
        description: 'It shows up in the Market as soon as you list it.',
        veraHint: 'Tell Vera roughly what it is and she writes the name and the details for you to edit.',
        manualHint: 'Go straight to the form: photos, price, and your own words.',
        aside: (
          <div className="space-y-4">
            <PayoutPromptCard prompt={payoutPrompt} />
            <FullShopUpsell />
          </div>
        ),
      }}
      details={{
        title: 'The details',
        description: 'Photos first. They are what a buyer looks at before anything else.',
      }}
      review={{
        title: 'Have a look before it goes up',
        description: 'Change anything here, or step back to redo the photos and the price.',
        createLabel: 'List it',
        note: 'A listing from your own account is an inquiry: buyers message you to arrange it. Taking payment comes with a Business Space.',
      }}
      initialDraft={{
        title: '',
        productKind: 'physical',
        category: '',
        images: [],
        description: '',
        priceCents: null,
        currency: 'usd',
        stock: null,
        // Both are what the maker path already does on create (ADR-596): a member product IS a Market
        // listing, and it goes live to browse immediately. Seeded so the review board tells the truth
        // about what will happen rather than showing a default nobody chose.
        marketPublished: true,
        status: 'active',
      }}
      placeholders={{
        title: 'e.g. Hand-thrown ceramic mug',
        category: 'e.g. Ceramics & Pottery',
        priceCents: 'e.g. 28',
      }}
      onDraftCopy={async ({ draft, sourceText }) =>
        draftMakerProductCopyAction({
          productKind: text(draft, 'productKind') === 'digital' ? 'digital' : 'physical',
          seed: [text(draft, 'title'), text(draft, 'category'), sourceText].filter(Boolean).join('. ').slice(0, 600),
        })
      }
      onCreate={async (draft) => {
        // The SAME action the old form posted to, with the same field names: it re-checks sign-in,
        // enforces the used-only rule (R3), normalizes the category, caps the photos, and redirects.
        const fd = new FormData()
        fd.set('title', text(draft, 'title'))
        fd.set('productKind', text(draft, 'productKind') === 'digital' ? 'digital' : 'physical')
        fd.set('price', typeof draft.priceCents === 'number' ? String(draft.priceCents / 100) : '')
        fd.set('category', text(draft, 'category'))
        fd.set('description', text(draft, 'description'))
        fd.set('images', JSON.stringify(Array.isArray(draft.images) ? draft.images : []))
        // An individual lists used goods. The old form's disabled "New" option was informational only:
        // the action rejects 'new' from a profile seller regardless (canListNew).
        fd.set('condition', 'used')
        await createMakerProductAction(fd)
        return 'That did not go through. Check the name and the price, then try again.'
      }}
      cancel={{ label: 'Not now', href: '/market' }}
      draftAside={(draft, set) =>
        upgradeOffer && typeof draft.priceCents === 'number' && draft.priceCents > 0 ? (
          <UpgradeMoment
            surface="product"
            target={{ spaceSlug: null, canUpgrade: false }}
            offer={upgradeOffer}
            // Keep it free: list it with no price; buyers message you. Photos and words stay.
            onKeepFree={() => set('priceCents', null)}
          />
        ) : null
      }
    />
  )
}

/** The member editor is thin on purpose: a Business Space unlocks the full Shop. */
function FullShopUpsell() {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary-bg/10 p-5">
      <div className="mb-2 flex items-center gap-2">
        <Store className="h-5 w-5 text-primary-strong" aria-hidden />
        <h2 className="text-body font-bold text-text">Want a full shop?</h2>
      </div>
      <p className="mb-4 text-body-sm text-muted">
        A Business Space gets a real storefront: products, bookable services, tickets, and collections,
        with checkout built in. A listing from your own account takes inquiries.
      </p>
      <Link href="/spaces/new" className={buttonClasses('secondary', 'md')}>
        Start a Business Space
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}
