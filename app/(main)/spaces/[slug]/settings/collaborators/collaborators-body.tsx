import Link from 'next/link'
import {
  listAcceptedCollaborations,
  listIncomingCollaborationRequests,
  listCollaborationsForSpace,
} from '@/lib/spaces/collaborations'
import { InviteCollaborator, RequestControls, RevokeControl, ReinviteControl } from './collaborator-controls'
import type { CollaborationView } from '@/lib/spaces/collaborations'

// The Collaborators management surface body (ADR-799 B1-UI). Chrome-free (the page wraps it in a
// FocusTemplate). Reads the space's collaborations three ways (incoming to approve, accepted, pending
// sent) and renders each with the client controls. Free to host.

/** A partner identity row (logo chip + name + a link to their space). */
function PartnerRow({ view }: { view: CollaborationView }) {
  const { partner, role } = view
  return (
    <div className="flex min-w-0 items-center gap-3">
      {partner.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator-supplied space logo, not a build asset
        <img src={partner.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-sm font-bold text-subtle">
          {partner.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <Link href={`/spaces/${partner.slug}`} className="block truncate font-semibold text-text hover:underline">
          {partner.name}
        </Link>
        <p className="truncate text-xs text-subtle">
          {role === 'host' ? 'Operates inside your space' : 'You operate inside their space'}
          {partner.tagline ? ` · ${partner.tagline}` : ''}
        </p>
      </div>
    </div>
  )
}

export async function CollaboratorsBody({
  spaceId,
  slug,
  manage,
  lockedReason = 'module',
}: {
  spaceId: string
  slug: string
  manage: boolean
  lockedReason?: 'plan' | 'module'
}) {
  if (!manage) {
    // Plan lock (ADR-810): a free space sees the value + the Go Business path. Hosting collaborators is a
    // Business feature; the collaborator pays for their own space, so the host pays nothing extra per guest.
    if (lockedReason === 'plan') {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
          <p className="text-text">
            Host other businesses inside your space. A wellness center hosts independent practitioners; a
            venue hosts the makers who sell there. Each keeps their own page, and they show as your
            collaborators.
          </p>
          <p className="mt-3">
            Hosting collaborators is a Business feature. The businesses you host pay for their own space, so
            it costs you nothing extra per collaborator.
          </p>
          <Link
            href={`/spaces/${slug}/settings/billing`}
            className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
          >
            Go Business
          </Link>
        </div>
      )
    }
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
        Collaborators is turned off for this space. Turn it on in the Module Manager to host other
        businesses inside your space.
      </p>
    )
  }

  const [incoming, accepted, all] = await Promise.all([
    listIncomingCollaborationRequests(spaceId),
    listAcceptedCollaborations(spaceId),
    listCollaborationsForSpace(spaceId),
  ])
  // Pending requests THIS space sent (awaiting the other side) — everything pending that is not incoming.
  const incomingIds = new Set(incoming.map((v) => v.id))
  const pendingSent = all.filter((v) => v.status === 'pending' && !incomingIds.has(v.id))
  // Declined rows, so an invite that was turned down does not silently vanish — the initiator sees it
  // and can re-send in one click (re-invite is allowed; the unique index covers only pending/accepted).
  const declined = all.filter((v) => v.status === 'declined')

  return (
    <div className="space-y-6">
      <InviteCollaborator spaceId={spaceId} />

      {incoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">Requests to approve</h2>
          <ul className="space-y-2">
            {incoming.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <PartnerRow view={v} />
                <RequestControls collaborationId={v.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text">Collaborators</h2>
        {accepted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
            No collaborators yet. Invite a business that runs inside your space above.
          </p>
        ) : (
          <ul className="space-y-2">
            {accepted.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <PartnerRow view={v} />
                <RevokeControl collaborationId={v.id} label="End collaboration" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingSent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">Invites sent</h2>
          <ul className="space-y-2">
            {pendingSent.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface p-4">
                <PartnerRow view={v} />
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-subtle">Waiting for them to approve</span>
                  <RevokeControl collaborationId={v.id} label="Cancel" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {declined.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">Declined</h2>
          <ul className="space-y-2">
            {declined.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface p-4">
                <PartnerRow view={v} />
                <ReinviteControl
                  spaceId={spaceId}
                  partnerSlug={v.partner.slug}
                  hostSide={v.role === 'host' ? 'initiator' : 'partner'}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
