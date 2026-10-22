import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Gift, Globe, Mail, PauseCircle, Phone, Store } from 'lucide-react'
import { getCachedUser, getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseVcard } from '@/lib/vcard'
import { safeWebsite } from '@/lib/profiles/website'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { tapTarget } from '@/lib/member-cards/face'
import { memberCardsEnabled, resolveTappedCard, type TappedCard } from '@/lib/member-cards/store'
import { FocusTemplate } from '@/components/templates'
import { Avatar } from '@/components/ui/avatar'
import { buttonClasses } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SwapForm } from './swap-form'

// /card/<token>: a member card's FACE (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). A phone
// tap on /c/<token> lands here when the owner set the face to "Show my card", and when the card is
// paused. What it shows is the owner's choice and nothing more:
//   • a member: photo, name, the title from their contact card (profiles.vcard), the phone and email
//     from that card only when the face switched them on, their website(s) when links are on, Save
//     contact when their contact card is on, and Swap contacts when the face takes swaps;
//   • a Space: its name, logo, tagline and cardholder perk, Save contact (every Space has a vCard)
//     and Swap contacts (a sealed lead in the Space's CRM).
// A paused card says so and names nobody. A face set to "page" or "link" sends the visitor where the
// tap would have, so this URL never shows a card its owner did not choose to show; the owner viewing
// their own card always sees it, as a preview.
//
// noindex and disallowed in robots: one person's card behind an opaque token. force-dynamic: it reads
// the viewer (to prefill the swap and spot the owner). The (public) layout reads no request data, so
// the share pages beside it keep their ISR.

export const metadata: Metadata = {
  title: 'Member card',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function CardFacePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<FaceSkeleton />}>
      <CardFace params={params} />
    </Suspense>
  )
}

function FaceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Skeleton className="mx-auto h-20 w-20 rounded-pill" />
      <Skeleton className="mx-auto h-7 w-48" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

/** The member's public card facts. Never their private contacts or anything the face left off. */
interface MemberFace {
  kind: 'member'
  name: string
  handle: string
  avatarUrl: string | null
  title: string | null
  phone: string | null
  email: string | null
  /** Websites, then the Spaces the member runs (`space`, opened in place). */
  links: { href: string; label: string; space?: boolean }[]
  canSave: boolean
}

interface SpaceFace {
  kind: 'space'
  name: string
  slug: string
  logoUrl: string | null
  tagline: string | null
  perk: string | null
}

async function loadMemberFace(card: TappedCard & { owner: { kind: 'member' } }): Promise<MemberFace | null> {
  try {
    const { data: p } = await createAdminClient()
      .from('profiles')
      .select('display_name, handle, avatar_url, vcard, website, is_active, is_system')
      .eq('id', card.owner.profileId)
      .maybeSingle()
    if (!p || p.is_active === false || p.is_system) return null
    const vcard = parseVcard(p.vcard)
    const links: MemberFace['links'] = []
    if (card.face.showLinks) {
      for (const raw of [p.website, vcard.website]) {
        const site = safeWebsite(raw)
        if (site && !links.some((l) => l.href === site.href)) links.push(site)
      }
      // THE BUSINESS HALF (LIVE-1302): a member who runs a Space shows it with their links, so one card
      // carries the business too. Only a public, active Space; its page is already public.
      const { data: spaces } = await createAdminClient()
        .from('spaces')
        .select('slug, name, brand_name')
        .eq('owner_profile_id', card.owner.profileId)
        .eq('status', 'active')
        .neq('visibility', 'private')
        .neq('type', 'root')
        .order('name')
        .limit(3)
      for (const sp of spaces ?? []) links.push({ href: `/spaces/${sp.slug}`, label: sp.brand_name || sp.name, space: true })
    }
    return {
      kind: 'member',
      name: p.display_name || p.handle,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      title: vcard.title,
      phone: card.face.showPhone ? vcard.phone : null,
      email: card.face.showEmail ? vcard.email : null,
      links,
      canSave: vcard.enabled,
    }
  } catch {
    return null
  }
}

async function loadSpaceFace(card: TappedCard & { owner: { kind: 'space' } }, viewer: string | null): Promise<SpaceFace | null> {
  try {
    const space = await getVisibleSpaceBySlug(card.owner.slug, viewer)
    if (!space) return null
    return {
      kind: 'space',
      name: space.brandName ?? space.name,
      slug: space.slug,
      logoUrl: space.brandLogoUrl,
      tagline: space.tagline ?? null,
      perk: card.face.cardholderPerk,
    }
  } catch {
    return null
  }
}

/** A signed-in tapper's own name, email and phone, for the swap form. Blank when signed out. */
async function loadPrefill(viewer: string | null): Promise<{ name: string; email: string; phone: string }> {
  const blank = { name: '', email: '', phone: '' }
  if (!viewer) return blank
  try {
    const [user, { data: p }] = await Promise.all([
      getCachedUser(),
      createAdminClient().from('profiles').select('display_name, phone').eq('id', viewer).maybeSingle(),
    ])
    return { name: p?.display_name ?? '', email: user?.email ?? '', phone: p?.phone ?? '' }
  } catch {
    return blank
  }
}

function isMemberCard(card: TappedCard): card is TappedCard & { owner: { kind: 'member' } } {
  return card.owner.kind === 'member'
}

async function CardFace({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!memberCardsEnabled()) redirect('/code-unavailable')
  const card = await resolveTappedCard(token)
  if (!card) redirect('/code-unavailable')
  if (card.face.paused) return <PausedFace />

  const viewer = await getMyProfileId()
  const isOwner = isMemberCard(card) && viewer === card.owner.profileId
  if (card.face.mode !== 'card' && !isOwner) {
    const target = tapTarget(card.owner, card.face, viewer)
    if (target.to === 'page') redirect(target.path)
    if (target.to === 'link') redirect(target.url)
  }

  const face = isMemberCard(card) ? await loadMemberFace(card) : await loadSpaceFace(card as TappedCard & { owner: { kind: 'space' } }, viewer)
  if (!face) redirect('/code-unavailable')

  const showSwap = card.face.swapBack && !isOwner
  const prefill = showSwap ? await loadPrefill(viewer) : { name: '', email: '', phone: '' }
  const saveHref = `/c/${encodeURIComponent(token)}/save`
  const firstName = face.kind === 'member' ? face.name.split(' ')[0] || face.name : face.name

  return (
    <FocusTemplate
      eyebrow={face.kind === 'member' ? 'Frequency card' : 'Frequency card holder'}
      title={face.name}
      description={(face.kind === 'member' ? face.title : face.tagline) ?? undefined}
      width="narrow"
      divider={false}
    >
      {isOwner && (
        <p className="mb-6 rounded-card border border-border bg-surface-elevated px-4 py-3 text-body-sm text-text">
          This is what people see when they tap your card.{' '}
          <Link href="/crew/card" className="font-semibold text-primary hover:underline">
            Change it
          </Link>
        </p>
      )}

      <section className="rounded-card border border-border bg-surface px-5 py-6 text-center lift-1">
        <Avatar src={face.kind === 'member' ? face.avatarUrl : face.logoUrl} name={face.name} size="xl" className="mx-auto" />

        {face.kind === 'space' && face.perk && (
          <p className="mt-4 flex items-start justify-center gap-2 rounded-card bg-primary-bg px-3 py-2 text-left text-body-sm text-text">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <span>
              <span className="font-semibold">Frequency cardholders:</span> {face.perk}
            </span>
          </p>
        )}

        {face.kind === 'member' && (face.phone || face.email || face.links.length > 0) && (
          <ul className="mt-5 space-y-2 text-left text-body-sm">
            {face.phone && (
              <li>
                <a href={`tel:${face.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-text hover:underline">
                  <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  {face.phone}
                </a>
              </li>
            )}
            {face.email && (
              <li>
                <a href={`mailto:${face.email}`} className="flex items-center gap-2 text-text hover:underline">
                  <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  {face.email}
                </a>
              </li>
            )}
            {face.links.map((l) => (
              <li key={l.href}>
                {l.space ? (
                  <Link href={l.href} className="flex items-center gap-2 text-text hover:underline">
                    <Store className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    {l.label}
                  </Link>
                ) : (
                  <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 text-text hover:underline">
                    <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    {l.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {face.kind === 'space' || face.canSave ? (
            // A plain <a>, not <Link>: a prefetch must never count a save.
            <a href={saveHref} className={buttonClasses('primary', 'md', 'w-full')}>
              Save contact
            </a>
          ) : null}
          <Link
            href={face.kind === 'member' ? `/people/${encodeURIComponent(face.handle)}` : `/spaces/${encodeURIComponent(face.slug)}`}
            className={buttonClasses(face.kind === 'space' || face.canSave ? 'secondary' : 'primary', 'md', 'w-full')}
          >
            {face.kind === 'member' ? 'See their Frequency page' : `Visit ${face.name}`}
          </Link>
        </div>
      </section>

      {showSwap && (
        <section aria-labelledby="swap-title" className="mt-6 rounded-card border border-border bg-surface px-5 py-6">
          <h2 id="swap-title" className="text-lead font-semibold text-text">
            Swap contacts
          </h2>
          <p className="mb-4 mt-1 text-body-sm text-muted">
            Leave your name and a way to reach you. {firstName} gets it in their contacts.
          </p>
          <SwapForm token={token} ownerName={firstName} forSpace={face.kind === 'space'} prefill={prefill} />
        </section>
      )}
    </FocusTemplate>
  )
}

function PausedFace() {
  return (
    <FocusTemplate title="This card is paused." description="Whoever carries it switched it off for now." width="narrow" divider={false}>
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-surface-elevated text-muted">
          <PauseCircle className="h-7 w-7" aria-hidden />
        </div>
        <Link href="/" className="mt-5 inline-block text-body-sm font-semibold text-primary hover:underline">
          Go to Frequency
        </Link>
      </div>
    </FocusTemplate>
  )
}
