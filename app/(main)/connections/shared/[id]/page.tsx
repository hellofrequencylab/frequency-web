import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Globe, Users, Lightbulb, User } from 'lucide-react'
import { connectionsOwnerId } from '@/lib/connections/access'
import { getSharedContact } from '@/lib/connections/store'
import { canViewLead } from '@/lib/crm/visibility'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Read-only discovery view of a capture another steward shared to the NETWORK
// (ADR-130 cross-steward tier). Gated three ways, defence-in-depth: the viewer must
// be a steward/staff (connectionsOwnerId), the row must be visibility='network'
// (getSharedContact), and the viewer must share its locality (canViewLead) — the
// search filter is never trusted alone. Only business-card fields show; email,
// phone, notes and tags stay with the owner, so an intro routes through them.
export default async function SharedContactPage({ params }: { params: Promise<{ id: string }> }) {
  const viewerId = await connectionsOwnerId()
  if (!viewerId) redirect('/feed')

  const { id } = await params
  const c = await getSharedContact(id)
  if (!c) notFound()

  // The owner gets their full record, not this stripped-down view.
  if (c.ownerId === viewerId) redirect(`/connections/${id}`)

  // Re-check the locality rule server-side (the authoritative gate).
  const { data: me } = await createAdminClient().from('profiles').select('city').eq('id', viewerId).maybeSingle()
  const viewerCity = (me?.city as string | undefined) ?? null
  const decision = canViewLead(
    { profileId: viewerId, city: viewerCity },
    { ownerId: c.ownerId, visibility: c.visibility, city: c.city, linkedProfileId: c.linkedProfileId },
  )
  if (!decision.visible) notFound()

  const name = c.displayName ?? 'Unnamed contact'
  const website = c.website ? (c.website.startsWith('http') ? c.website : `https://${c.website}`) : null
  const hasLinks = website || c.socials.instagram || c.socials.linkedin || c.socials.x

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/people"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Back to people
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-lg font-semibold text-muted">
            {c.displayName ? getInitials(name) : <User className="h-7 w-7" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-text">{name}</h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium text-muted">
                <Globe className="h-3 w-3" /> Network contact
              </span>
            </div>
            {(c.title || c.company) && (
              <p className="truncate text-sm text-muted">{[c.title, c.company].filter(Boolean).join(' · ')}</p>
            )}
            {c.city && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-subtle">
                <MapPin className="h-3 w-3" /> {c.city}
              </p>
            )}
          </div>
        </div>

        {/* How to act on it: ask the capturing steward for an intro. */}
        <div className="mt-4 rounded-xl bg-surface-elevated/60 p-3">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Users className="h-4 w-4 shrink-0" /> Shared to the network by{' '}
            {c.ownerHandle ? (
              <Link href={`/people/${c.ownerHandle}`} className="font-medium text-primary-strong hover:underline">
                {c.ownerName ?? 'a steward'}
              </Link>
            ) : (
              <span className="font-medium text-text">{c.ownerName ?? 'a steward'}</span>
            )}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-subtle">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> They met this person — reach out to them for an introduction.
          </p>
        </div>

        {/* Business-card links only. */}
        {hasLinks && (
          <div className="mt-4 space-y-2 text-sm">
            {website && (
              <a href={website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary-strong hover:underline">
                <Globe className="h-4 w-4 shrink-0 text-subtle" /> {c.website!.replace(/^https?:\/\//, '')}
              </a>
            )}
            {c.socials.instagram && <SocialRow label="Instagram" value={c.socials.instagram} />}
            {c.socials.linkedin && <SocialRow label="LinkedIn" value={c.socials.linkedin} />}
            {c.socials.x && <SocialRow label="X" value={c.socials.x} />}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-subtle">
        A steward chose to share this private contact with stewards in {c.city ?? 'your area'}. Their notes, email and
        phone stay private — connect through the steward above.
      </p>
    </div>
  )
}

function SocialRow({ label, value }: { label: string; value: string }) {
  const href = value.startsWith('http') ? value : null
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-subtle">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="truncate text-primary-strong hover:underline">{value}</a>
      ) : (
        <span className="truncate text-text">{value}</span>
      )}
    </div>
  )
}
