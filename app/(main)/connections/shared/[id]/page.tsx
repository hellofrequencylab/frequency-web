import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Globe, Users, Lightbulb, User } from 'lucide-react'
import { connectionsOwnerId } from '@/lib/connections/access'
import { getSharedContact } from '@/lib/connections/store'
import { canViewLead } from '@/lib/crm/visibility'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'
import { DetailTemplate } from '@/components/templates'

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

  const metaParts = [c.title, c.company].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-2xl">
      <DetailTemplate
        title={
          <span className="inline-flex items-center gap-3 align-middle">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-base font-semibold text-muted">
              {c.displayName ? getInitials(name) : <User className="h-6 w-6" />}
            </span>
            <span className="truncate">{name}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {metaParts && <span>{metaParts}</span>}
            {c.city && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.city}</span>
            )}
          </span>
        }
        badges={
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium text-muted">
            <Globe className="h-3 w-3" /> Network contact
          </span>
        }
      >
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        {/* How to act on it: ask the capturing steward for an intro. */}
        <div className="rounded-xl bg-surface-elevated/60 p-3">
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
      </DetailTemplate>
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
