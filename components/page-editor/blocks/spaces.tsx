import Link from 'next/link'
import Image from 'next/image'
import { Star } from 'lucide-react'
import type { ComponentConfig } from '@measured/puck'

import { SiteImage } from '@/components/marketing/site-image'
import { FaqList } from '@/components/marketing/marketing-ui'
import { richParagraphs } from '@/lib/page-editor/richtext'
import { focalField, focalClass } from '@/lib/page-editor/image-controls'
import {
  Eyebrow,
  accentize,
  emphasisClasses,
  visClass,
  type LayoutValue,
  type EmphasisValue,
} from '@/components/page-editor/blocks/kit'
import { imgField, emphasisField, emphasisDefault } from '@/lib/page-editor/fields'
import { layoutField, layoutDefault } from '@/lib/page-editor/layout'
// TYPE-ONLY import: the data shapes are erased at build, so this never pulls the server reader
// (createAdminClient) into the client editor bundle. The blocks read these off puck.metadata.space,
// injected by the RSC render path (components/spaces/space-landing.tsx). This is the build-trap
// boundary: a Space content block imports NOTHING server-only.
import type {
  SpaceContentData,
  SpaceUpdateItem,
  SpaceReviewsData,
  SpaceFaqItem,
} from '@/lib/spaces/content-data'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE CONTENT BLOCKS (Puck content blocks, Phase 2, ADR-476/472). Four blocks a
// Space operator composes onto their public landing, dual-purpose (editable in
// <Puck>, rendered by <Render>):
//   Cover        - an uploadable full-width banner (media/layout).
//   SpaceUpdates - the brand's blog-style posts feed (DYNAMIC, reads real rows).
//   SpaceReviews - member reviews: average + latest few (DYNAMIC).
//   SpaceFAQ     - operator Q and A rendered as an accordion (DYNAMIC).
// The three dynamic blocks read the live rows off `puck.metadata.space`
// (SpaceContentData), injected server-side by the Space landing render path -- the
// SAME metadata-injection pattern LiveStats + the Circles index blocks use. With no
// metadata (the editor canvas) each shows a labelled placeholder the operator can
// drag-rearrange, so the editor never depends on live data and this module stays
// client-safe (it imports nothing server-only). Copy is CONTENT-VOICE: plain, no em
// dashes, never invented counts.
// ─────────────────────────────────────────────────────────────────────────────

type PuckArg = { metadata?: Record<string, unknown> } | undefined
function spaceFrom(puck: PuckArg): SpaceContentData | undefined {
  return puck?.metadata?.space as SpaceContentData | undefined
}

// Shown in the editor canvas (no live data) so a section stays visible + draggable there.
function EditorStub({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center text-sm text-muted">
      {label}
      <span className="mt-0.5 block text-2xs text-subtle">{hint}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cover -- an uploadable full-width banner image with focal + height controls.
// Full-bleed, so it owns its own <section> (like the Hero image variant).
// ─────────────────────────────────────────────────────────────────────────────

const COVER_HEIGHT: Record<string, string> = {
  short: 'h-56 sm:h-64',
  medium: 'h-72 sm:h-96',
  tall: 'h-96 sm:h-[32rem]',
}
function coverHeight(h?: string): string {
  return COVER_HEIGHT[h ?? 'medium'] ?? COVER_HEIGHT.medium
}

export function CoverBlock({
  image,
  alt,
  focal,
  height,
  eyebrow,
  title,
  vis,
}: {
  image?: string
  alt?: string
  focal?: string
  height?: string
  eyebrow?: string
  title?: string
  vis?: string
}) {
  return (
    <section className={`relative w-full overflow-hidden ${coverHeight(height)} ${vis ?? ''}`}>
      <Image
        src={image || '/images/site/lab-storefront.jpg'}
        alt={alt || ''}
        fill
        sizes="100vw"
        className={`object-cover ${focalClass(focal)}`}
      />
      {(eyebrow || title) && (
        <>
          {/* A soft scrim keeps overlaid text legible on any photo (no hardcoded hex; a
              neutral black/40 overlay is the one exception the kit already uses on heroes). */}
          <div className="absolute inset-0 bg-black/35" aria-hidden />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            {eyebrow && (
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-white/80 mb-3">{eyebrow}</p>
            )}
            {title && (
              <h1 className="font-display uppercase text-balance text-white text-[clamp(1.875rem,6vw,3.5rem)]">
                {title}
              </h1>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SpaceUpdates -- the brand's blog-style posts feed (latest N + view all).
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceUpdatesBlock({
  eyebrow,
  heading,
  updates,
  limit,
  viewAllHref,
  ink,
}: {
  eyebrow?: string
  heading?: string
  updates: SpaceUpdateItem[]
  limit: number
  viewAllHref?: string
  ink?: boolean
}) {
  if (updates.length === 0) return null
  const shown = updates.slice(0, Math.max(1, limit))
  return (
    <div>
      {(eyebrow || heading) && (
        <div className="mb-8">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {heading && (
            <h2 className={`font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] ${ink ? 'text-on-ink' : 'text-text'}`}>
              {heading}
            </h2>
          )}
        </div>
      )}
      <div className="space-y-6">
        {shown.map((u) => (
          <article
            key={u.id}
            className={`overflow-hidden rounded-2xl border ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface'} shadow-sm`}
          >
            {u.imageUrl && (
              <SiteImage src={u.imageUrl} alt={u.title || ''} aspect="16/9" sizes="(min-width: 640px) 40rem, 100vw" />
            )}
            <div className="p-6">
              {u.title && (
                <h3 className={`text-xl font-bold mb-2 ${ink ? 'text-on-ink' : 'text-text'}`}>{u.title}</h3>
              )}
              {u.body && (
                <div className={`text-base leading-relaxed space-y-3 ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
                  {richParagraphs(u.body)}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {viewAllHref && updates.length > shown.length && (
        <div className="mt-6">
          <Link
            href={viewAllHref}
            className={`inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${ink ? 'text-primary' : 'text-primary-strong'} hover:underline`}
          >
            View all updates
          </Link>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SpaceReviews -- member reviews: average + latest few.
// ─────────────────────────────────────────────────────────────────────────────

function Stars({ rating, ink }: { rating: number; ink?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${n <= Math.round(rating) ? 'fill-primary text-primary' : ink ? 'text-white/25' : 'text-border-strong'}`}
          aria-hidden
        />
      ))}
    </span>
  )
}

export function SpaceReviewsBlock({
  eyebrow,
  heading,
  reviews,
  limit,
  ink,
}: {
  eyebrow?: string
  heading?: string
  reviews: SpaceReviewsData
  limit: number
  ink?: boolean
}) {
  // Honest at day zero: with no reviews the block renders nothing (never a fake average).
  if (reviews.count === 0) return null
  const shown = reviews.latest.slice(0, Math.max(1, limit))
  return (
    <div>
      {(eyebrow || heading) && (
        <div className="mb-6">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {heading && (
            <h2 className={`font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] ${ink ? 'text-on-ink' : 'text-text'}`}>
              {heading}
            </h2>
          )}
        </div>
      )}
      {reviews.average !== null && (
        <div className="mb-6 flex items-center gap-3">
          <span className={`font-display text-4xl ${ink ? 'text-on-ink' : 'text-text'}`}>{reviews.average.toFixed(1)}</span>
          <Stars rating={reviews.average} ink={ink} />
          <span className={`text-sm ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
            {reviews.count === 1 ? '1 review' : `${reviews.count} reviews`}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shown.map((r) => (
          <article
            key={r.id}
            className={`rounded-2xl border p-5 ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface'}`}
          >
            <Stars rating={r.rating} ink={ink} />
            {r.body && (
              <p className={`mt-3 text-base leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-text'}`}>{r.body}</p>
            )}
            <p className={`mt-3 text-sm font-semibold ${ink ? 'text-on-ink' : 'text-muted'}`}>
              {r.author?.displayName ?? 'Member'}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SpaceFAQ -- operator Q and A as an accordion (reuses the FaqList look).
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceFaqBlock({
  eyebrow,
  heading,
  faqs,
  ink,
  emphasis,
}: {
  eyebrow?: string
  heading?: React.ReactNode
  faqs: SpaceFaqItem[]
  ink?: boolean
  emphasis?: EmphasisValue
}) {
  if (faqs.length === 0) return null
  const { scale, accent } = emphasisClasses(emphasis)
  const items = faqs.map((f) => ({ q: f.question, a: richParagraphs(f.answer) }))
  return (
    <div>
      {(eyebrow || heading) && (
        <div className="mb-8">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {heading && (
            <h2 className={`font-display uppercase text-balance ${scale} ${accent || (ink ? 'text-on-ink' : 'text-text')}`}>
              {heading}
            </h2>
          )}
        </div>
      )}
      <FaqList items={items} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map -- exported as spacesComponents
// ─────────────────────────────────────────────────────────────────────────────

export const spacesComponents: Record<string, ComponentConfig> = {
  Cover: {
    label: 'Cover banner',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      focal: focalField,
      height: {
        type: 'select',
        label: 'Height',
        options: [
          { label: 'Short', value: 'short' },
          { label: 'Medium', value: 'medium' },
          { label: 'Tall', value: 'tall' },
        ],
      },
      eyebrow: { type: 'text', label: 'Overlay eyebrow (optional)' },
      title: { type: 'textarea', label: 'Overlay title (optional)' },
      layout: layoutField,
    },
    defaultProps: {
      image: '',
      alt: '',
      focal: 'center',
      height: 'medium',
      eyebrow: '',
      title: '',
      layout: layoutDefault,
    },
    render: ({ image, alt, focal, height, eyebrow, title, layout }) => (
      <CoverBlock
        image={image as string}
        alt={alt as string}
        focal={focal as string}
        height={height as string}
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  SpaceUpdates: {
    label: 'Space updates (live)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      heading: { type: 'textarea', label: 'Heading (optional)' },
      limit: {
        type: 'select',
        label: 'How many to show',
        options: [
          { label: '2', value: '2' },
          { label: '3', value: '3' },
          { label: '5', value: '5' },
        ],
      },
      viewAllHref: { type: 'text', label: 'View-all link (optional)' },
    },
    defaultProps: {
      eyebrow: 'Latest',
      heading: 'From the team',
      limit: '3',
      viewAllHref: '',
    },
    render: ({ eyebrow, heading, limit, viewAllHref, puck }) => {
      const d = spaceFrom(puck)
      return d ? (
        <SpaceUpdatesBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          updates={d.updates}
          limit={Number(limit) || 3}
          viewAllHref={(viewAllHref as string) || undefined}
        />
      ) : (
        <EditorStub label="Space updates" hint="Your published updates show on the live page" />
      )
    },
  },

  SpaceReviews: {
    label: 'Space reviews (live)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      heading: { type: 'textarea', label: 'Heading (optional)' },
      limit: {
        type: 'select',
        label: 'How many to show',
        options: [
          { label: '2', value: '2' },
          { label: '4', value: '4' },
          { label: '6', value: '6' },
        ],
      },
    },
    defaultProps: {
      eyebrow: 'What members say',
      heading: 'Reviews',
      limit: '4',
    },
    render: ({ eyebrow, heading, limit, puck }) => {
      const d = spaceFrom(puck)
      return d ? (
        <SpaceReviewsBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          reviews={d.reviews}
          limit={Number(limit) || 4}
        />
      ) : (
        <EditorStub label="Space reviews" hint="Member reviews show on the live page" />
      )
    },
  },

  SpaceFAQ: {
    label: 'Space FAQ (live)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      heading: { type: 'textarea', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      emphasis: emphasisField,
    },
    defaultProps: {
      eyebrow: 'FAQ',
      heading: 'Common questions',
      titleAccent: '',
      emphasis: emphasisDefault,
    },
    render: ({ eyebrow, heading, titleAccent, emphasis, puck }) => {
      const d = spaceFrom(puck)
      return d ? (
        <SpaceFaqBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={heading ? accentize(heading as string, titleAccent as string) : undefined}
          faqs={d.faqs}
          emphasis={emphasis as EmphasisValue}
        />
      ) : (
        <EditorStub label="Space FAQ" hint="Your questions show on the live page" />
      )
    },
  },
}
