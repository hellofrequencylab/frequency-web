'use client'

// The "Post a listing" Spark (docs/STUDIO.md §0, ADR-986). Replaces the one-shot Studio window that
// used to collect photos as URLs typed into a textarea, one per line. Photos now go through the Loom
// like every other image on the platform (ADR-987): pick one you already have, upload from your phone,
// or drop it on the first screen and it files itself.
//
// Everything on screen comes from LISTING_MANIFEST (lib/studio/entities/listing.ts). No field, label,
// or control is declared here.
//
// The Loom scope is deliberately left undefined: a member posting to the neighbourhood board should see
// their own Loom plus every Space they run, which is what the picker does with no scopeKey.

import { useRouter } from 'next/navigation'
import { isError } from '@/lib/action-result'
import { CommerceSpark, type SparkDraft } from '@/components/studio/commerce/commerce-spark'
import { LISTING_MANIFEST } from '@/lib/studio/entities/listing'
import type { ListingKind } from '@/lib/marketplace'
import { createListingAction, draftBoardListingCopyAction } from './actions'

/** Read a scalar off the draft as text. */
function text(draft: SparkDraft, key: string): string {
  const v = draft[key]
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)
}

/** The listing kinds the manifest declares, narrowed for the writer. Default-deny to 'offer'. */
function asKind(raw: string): ListingKind {
  return raw === 'free' || raw === 'lend' || raw === 'request' ? raw : 'offer'
}

export function ListingSpark() {
  const router = useRouter()

  return (
    <CommerceSpark
      manifest={LISTING_MANIFEST}
      eyebrow="Post a listing"
      doors={{
        title: 'What are you offering or looking for?',
        description:
          'Free to post. No money changes hands in the app: neighbours message you and you arrange the rest.',
        veraHint: 'Say roughly what it is and Vera writes the headline and the details for you to edit.',
        manualHint: 'Go straight to the form: photos, a headline, and your own words.',
      }}
      details={{
        title: 'The details',
        description: 'A photo does most of the work here. Everything else is optional.',
      }}
      review={{
        title: 'Have a look before it posts',
        description: 'Change anything here, or step back to redo the photos.',
        createLabel: 'Post it',
        note:
          'No money changes hands in the app. Arrange that offline. Be kind: this is mutual support, not a storefront.',
      }}
      initialDraft={{
        title: '',
        kind: 'offer',
        category: '',
        images: [],
        description: '',
        priceNote: '',
        neighborhood: '',
        city: '',
        status: 'active',
      }}
      placeholders={{
        title: 'e.g. Two garden chairs, free to a good home',
        category: 'e.g. furniture, tools, lessons',
        priceNote: 'e.g. $20, or a trade, or free',
        neighborhood: 'e.g. Riverside',
        city: 'e.g. Portland',
      }}
      onDraftCopy={async ({ draft, sourceText }) =>
        draftBoardListingCopyAction({
          kind: text(draft, 'kind'),
          seed: [text(draft, 'title'), text(draft, 'category'), text(draft, 'priceNote'), sourceText]
            .filter(Boolean)
            .join('. ')
            .slice(0, 600),
        })
      }
      onCreate={async (draft) => {
        // The SAME action the Studio window posted to: it re-checks the signed-in gate, requires a
        // title, and caps the photos (cleanImages, 6).
        const res = await createListingAction({
          title: text(draft, 'title'),
          kind: asKind(text(draft, 'kind')),
          category: text(draft, 'category'),
          priceNote: text(draft, 'priceNote'),
          description: text(draft, 'description'),
          neighborhood: text(draft, 'neighborhood'),
          city: text(draft, 'city'),
          images: Array.isArray(draft.images) ? draft.images.map((v) => String(v)) : [],
        })
        if (isError(res)) return res.error
        router.push(`/classifieds/${res.data.id}`)
        return null
      }}
      cancel={{ label: 'Not now', href: '/classifieds' }}
    />
  )
}
