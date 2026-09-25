import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { decodeLegacyEntities } from '@/lib/entity-blocks/block-content'
import { readContactFormContent } from '@/lib/spaces/contact-tab'
import { SpaceContactBlock } from '@/components/page-editor/blocks/profile'
import { ContactFormBlock } from '@/components/spaces/contact-form-block'

// THE CONTACT TAB — the Space's own door for someone who wants to reach it.
//
// Lives inside the (profile) group so the cover, identity row and tab menu come from the layout.
// This file is only the body, so it never carries a second <h1> (check:headers proves it).
//
// 🔴 IT INVENTS NO STORAGE, AND THAT IS THE WHOLE DESIGN. The nine operator-authored strings
// (heading, intro, the field labels, the button, the thank-you message) already have a home: the
// `contactForm` block's content bag on the Space's page layout. This tab reads THAT bag rather than
// a `preferences.contactTab` node of its own, because a second home for the same keys would mean a
// precedence rule in every render site and two places to edit one sentence. The operator edits the
// block; the tab follows. One source of truth, and the form on Home and the form here can never
// disagree about what they say.
//
// The consequence, stated so it is not read as a bug: a Space that has never placed a contact-form
// block gets the form with its DEFAULT wording. That is the right failure — the door still works
// and the operator's copy, when they write it, lands in both places at once.
//
// WHY IT IS INDEXABLE, unlike /people. A contact page is exactly the local-intent content an
// answer engine wants for "how do I book X" or "where is X", and it exposes nothing a visitor
// could not already read on the Home page's contact section. `/people` noindexes because a roster
// is not public; a phone number the operator published is.
//
// THE #contact ANCHOR STILL WORKS. This tab is an ADDITIONAL door, not a move: the `contact` block
// stays on Home, so `<section id="contact">` still exists and the 16 stored "Get in touch" buttons
// across the Space page docs (scripts/stored-links.json) keep resolving. Retiring that anchor would
// be a migration, and it is not this change.

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'contact',
    label: 'Contact',
    describe: (brandName) => `Get in touch with ${brandName}.`,
  })
}

export default async function SpaceContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  // ROOT never offers it: the platform tenant is not a business anyone writes to, and the same leak
  // class every other tab in this group closes.
  if (space.type === 'root') redirect(`/spaces/${slug}`)
  setActiveSpace(space)

  const ctx = toProfileContext(space)
  const brandName = space.brandName ?? space.name
  const data = await getSpaceContentData(space.id, {
    name: ctx.brandName,
    type: ctx.type,
    logoUrl: ctx.logoUrl,
    coverUrl: ctx.coverUrl,
    tagline: ctx.tagline,
    primaryCta: { label: defaultPrimaryCtaLabel(ctx.type), href: `/spaces/${space.slug}/book` },
    slug: space.slug,
    profile: ctx.profile,
  })

  // The operator's authored copy for the form, read off the contactForm block's own bag.
  const form = readContactFormContent(space.preferences)
  // Decoded on read for the same reason both other render sites decode: `contactForm` is a CONTENT
  // block, so the sanitizer runs its textareas through sanitizeInlineHtml (escaping `'` and `"`),
  // while every render site draws them as PLAIN text — and a plain render of an escaped string
  // prints the entity verbatim. A no-op on a value carrying real markup.
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? decodeLegacyEntities(v) : undefined)

  const p = data.profile
  const hasFacts = !!(p && (p.address || p.phone || p.email || p.hours || p.website))

  return (
    <div className="space-y-10">
      <p className="text-body-sm leading-relaxed text-muted">
        Send {brandName} a message, and it lands with the people who run this Space.
      </p>

      <ContactFormBlock
        slug={space.slug}
        eyebrow={str(form.eyebrow)}
        title={str(form.title)}
        body={str(form.body)}
        showPhone={form.showPhone === true}
        showMessage={form.showMessage !== false}
        messageLabel={str(form.messageLabel)}
        optInLabel={str(form.optInLabel)}
        submitLabel={str(form.submitLabel)}
        successMessage={str(form.successMessage)}
      />

      {/* The facts half, drawn by the SAME block the Home page's contact section draws, so the two
          surfaces cannot describe one business differently. Fail-safe: no facts, no card. */}
      {hasFacts && p && (
        <SpaceContactBlock
          eyebrow="Find us"
          heading="Contact and hours"
          address={p.address}
          hours={p.hours}
          phone={p.phone}
          email={p.email}
          linkHref={p.website}
          linkLabel={p.website ? 'Visit website' : undefined}
        />
      )}
    </div>
  )
}
