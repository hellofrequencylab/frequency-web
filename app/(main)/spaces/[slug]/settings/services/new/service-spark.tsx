'use client'

// The "New service" Spark (docs/STUDIO.md §0, ADR-986). A Space's bookable work: a session, a class,
// a job. Every field on screen comes from SERVICE_MANIFEST (lib/studio/entities/service.ts).
//
// PHOTOS: no service editor could attach one before, so every service card in the Market rendered
// bare. The manifest declares an `images` field, which the field kit renders as the Loom picker, and
// this surface passes the SPACE ID as the Loom scope, so a photo picked or uploaded here files into
// that Space's library and a teammate can reuse it on the next listing.
//
// The create call is the existing `createSpaceProductAction`, with the field names it already parses,
// so the Space gate, the booking-calendar wiring, and the metadata.service shape are untouched.

import { useRouter } from 'next/navigation'
import { CommerceSpark, type SparkDraft } from '@/components/studio/commerce/commerce-spark'
import { SERVICE_MANIFEST } from '@/lib/studio/entities/service'
import { createSpaceProductAction, draftListingCopyAction } from '../../shop/shop-actions'
import type { ServicePriceModel } from '@/lib/commerce/types'

/** Read a dotted path off the draft as text. */
function text(draft: SparkDraft, path: string): string {
  let cur: unknown = draft
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return ''
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : cur === null || cur === undefined ? '' : String(cur)
}

/** Read a dotted path as a finite number, or null. */
function num(draft: SparkDraft, path: string): number | null {
  const raw = text(draft, path)
  const n = Number(raw)
  return raw.trim() && Number.isFinite(n) ? n : null
}

/** Narrow the manifest's price-model choice for the writer. Default-deny to 'fixed'. */
function asPriceModel(raw: string): ServicePriceModel {
  return raw === 'from' || raw === 'free' || raw === 'contact' ? raw : 'fixed'
}

export function ServiceSpark({ slug, spaceId, spaceName }: { slug: string; spaceId: string; spaceName: string }) {
  const router = useRouter()

  return (
    <CommerceSpark
      manifest={SERVICE_MANIFEST}
      eyebrow={`${spaceName} · New service`}
      // Images file into THIS Space's Loom, so the room, the work, and the practitioner are reusable
      // across every listing the Space makes.
      scopeKey={spaceId}
      doors={{
        title: 'What do you do for someone?',
        description:
          'A session, a class, a job. It lands in your catalog, and you publish it when it is ready.',
        veraHint: 'Say roughly what the work is and Vera writes the name and the details for you to edit.',
        manualHint: 'Go straight to the form: photos, how you price it, and how long it runs.',
      }}
      details={{
        title: 'The details',
        description:
          'How you price it decides what a buyer gets. Contact for pricing opens an enquiry instead of a checkout.',
      }}
      review={{
        title: 'Have a look before it goes in the catalog',
        description: 'Change anything here, or step back to redo the photos and the price.',
        createLabel: 'Add it to the catalog',
        note:
          'It books against this Space’s own calendar, and it goes live in your Shop right away. Use Add to Market on the catalog card when you want it in the community Market too.',
      }}
      initialDraft={{
        title: '',
        category: '',
        images: [],
        description: '',
        priceCents: null,
        currency: 'usd',
        // A Space listing stays in its own Shop until the owner opts it into the Market from the
        // catalog card, which is what createSpaceProductAction already defaults to.
        marketPublished: false,
        // The writer publishes a new catalog item immediately (status 'active'), so the board says so.
        status: 'active',
        metadata: { service: { priceModel: 'fixed' } },
      }}
      placeholders={{
        title: 'e.g. 60 minute deep tissue massage',
        category: 'e.g. Bodywork & Massage',
        priceCents: 'e.g. 120',
        'metadata.service.durationMin': 'e.g. 60',
      }}
      onDraftCopy={async ({ draft, sourceText }) =>
        draftListingCopyAction(slug, {
          kind: 'service',
          priceModel: asPriceModel(text(draft, 'metadata.service.priceModel')),
          seed: [text(draft, 'title'), text(draft, 'category'), sourceText].filter(Boolean).join('. ').slice(0, 600),
        })
      }
      onCreate={async (draft) => {
        const priceModel = asPriceModel(text(draft, 'metadata.service.priceModel'))
        const priceCents = num(draft, 'priceCents')
        const fd = new FormData()
        fd.set('kind', 'service')
        fd.set('title', text(draft, 'title'))
        // The writer requires a number it can round. A free or contact-only service quotes nothing, and
        // the manifest does not require a price, so an unset one posts as zero rather than silently
        // failing the create.
        fd.set('price', String((priceCents ?? 0) / 100))
        fd.set('priceModel', priceModel)
        fd.set('category', text(draft, 'category'))
        fd.set('description', text(draft, 'description'))
        fd.set('images', JSON.stringify(Array.isArray(draft.images) ? draft.images : []))
        const duration = num(draft, 'metadata.service.durationMin')
        if (duration) fd.set('durationMin', String(duration))
        await createSpaceProductAction(slug, fd)
        // The action revalidates the console rather than redirecting, so the Spark takes the operator
        // back to the catalog it just added to.
        router.push(`/spaces/${slug}/settings/shop?tab=catalog`)
        return null
      }}
      cancel={{ label: 'Back to the Shop', href: `/spaces/${slug}/settings/shop?tab=catalog` }}
    />
  )
}
