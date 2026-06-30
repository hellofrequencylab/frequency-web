// Growth OS · Engine 3 — one application's review console (GE3-4, ADR-456). The
// per-application detail: the track, the applicant, their answers, the decision
// trail, and the accept/decline controls. Accepting a host grants the role and hands
// off a Starter Circle (the reviewer picks which, or the first active one is used).
// Composes the kit (AdminTemplate + AdminSection).
//
// Gate: re-checked here AND in every action (the admin client bypasses RLS).

import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { requireAdmin } from '@/lib/admin/guard'
import { getApplication, applicantNames } from '@/lib/applications/store'
import { getTrack, STATUS_LABEL } from '@/lib/applications/tracks'
import { getActiveTemplates } from '@/lib/circles/templates-data'
import { DecideConsole } from './decide-console'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'info',
  in_review: 'warning',
  accepted: 'success',
  declined: 'neutral',
  withdrawn: 'neutral',
}

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('admin', { staff: 'members' })
  const { id } = await params

  const app = await getApplication(id)
  if (!app) notFound()

  const track = getTrack(app.track)
  const names = app.applicantProfileId
    ? await applicantNames([app.applicantProfileId])
    : new Map<string, { displayName: string; handle: string | null }>()
  const resolved = app.applicantProfileId ? names.get(app.applicantProfileId) : undefined
  const applicant = app.applicantName || resolved?.displayName || app.applicantEmail || 'Someone'

  // Starter Circles to choose from for a host accept (deciders pick, else the first).
  const starterTemplates = track?.grantsHost
    ? (await getActiveTemplates()).map((t) => ({ id: t.id, name: t.name, pillar: t.primaryPillar }))
    : []

  // Answers in the track's declared order (the keys map back to the questions).
  const answers = (track?.questions ?? []).map((q) => ({
    label: q.label,
    value: typeof app.answers[q.key] === 'string' ? (app.answers[q.key] as string) : '',
  }))

  const decided = app.status === 'accepted' || app.status === 'declined' || app.status === 'withdrawn'

  return (
    <AdminTemplate
      eyebrow={track?.label ?? 'Application'}
      title={applicant}
      icon={Users}
      width="default"
      back={{ href: '/admin/growth/applications', label: 'Applications' }}
    >
      <AdminSection title="Application">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS_TONE[app.status] ?? 'neutral'}>
              {STATUS_LABEL[app.status]}
            </StatusChip>
            <span className="text-xs text-subtle">
              {track?.label ?? app.track} · applied {new Date(app.createdAt).toLocaleDateString()}
            </span>
          </div>

          {resolved?.handle && <p className="text-sm text-muted">@{resolved.handle}</p>}
          {app.applicantEmail && <p className="text-sm text-muted">{app.applicantEmail}</p>}

          <dl className="space-y-3 border-t border-border/70 pt-4">
            {answers.length === 0 ? (
              <p className="text-sm text-muted">No questions on this track.</p>
            ) : (
              answers.map((a, i) => (
                <div key={i}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">{a.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-text">{a.value || '—'}</dd>
                </div>
              ))
            )}
          </dl>
        </div>
      </AdminSection>

      {decided && (
        <AdminSection title="Decision">
          <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
            <p className="text-text">
              {STATUS_LABEL[app.status]}
              {app.decidedAt ? ` on ${new Date(app.decidedAt).toLocaleDateString()}` : ''}.
            </p>
            {app.decisionReason && <p className="mt-1 text-muted">{app.decisionReason}</p>}
            {app.handoff?.circleSlug && (
              <p className="mt-2 text-muted">
                Handed off the Starter Circle{' '}
                <span className="font-semibold text-text">{app.handoff.circleSlug}</span> and granted the host role.
              </p>
            )}
          </div>
        </AdminSection>
      )}

      {!decided && (
        <AdminSection
          title="Decide"
          description={
            track?.grantsHost
              ? 'Accept to grant the host role and hand off a Starter Circle draft they own and finish. Decline with an optional note.'
              : 'Accept or decline. Operator provisioning lands when the Space tools open (GE10); accepting records the decision now.'
          }
        >
          <DecideConsole
            applicationId={app.id}
            status={app.status}
            grantsHost={!!track?.grantsHost}
            starterTemplates={starterTemplates}
          />
        </AdminSection>
      )}
    </AdminTemplate>
  )
}
