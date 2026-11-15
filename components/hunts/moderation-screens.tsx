import { FocusTemplate } from '@/components/templates/focus-template'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { triage, type playerView } from '@/lib/hunts/moderation'
import { ModerationActions } from './moderation-actions'
import { ReportTrailForm } from './report-trail-form'
import type { HuntModerationReader, HuntModerationScope } from '@/lib/hunts/moderation-reader'

/** `reportSlug` turns the report control on; without it the control stays disabled (reporting unavailable). */
export function HuntPlayerSafety({ banner, reportSlug }: { banner: ReturnType<typeof playerView>['banner']; reportSlug?: string }) {
  if (!huntSwitchOn('enabled')) return null

  return (
    <section aria-label="Trail safety" className="space-y-2">
      {banner !== 'none' && (
        <p role="status" className="rounded-card border border-border bg-surface p-4 text-body-sm text-muted">
          {banner === 'paused'
            ? 'This Trail is paused. Your progress is safe.'
            : 'This Trail has closed. Your progress stays here.'}
        </p>
      )}
      {reportSlug ? (
        <ReportTrailForm slug={reportSlug} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled>Report this Trail</Button>
          <p className="text-body-sm text-muted">Reporting is currently unavailable.</p>
        </div>
      )}
    </section>
  )
}

/** `canAct` shows the pause, resume and close controls; the route sets it only when the caller was authorized. */
export async function HuntModerationScreen({ scope, reader, canAct = false }: {
  scope: HuntModerationScope | null
  reader: HuntModerationReader
  canAct?: boolean
}) {
  if (!huntSwitchOn('authoring')) return null

  const authorized = scope && scope.huntIds.length > 0 ? scope : null
  const allowed = new Set(authorized?.huntIds)
  const cases = authorized ? await reader(authorized).catch(() => null) : null
  const queue = cases
    ?.filter((item) => allowed.has(item.huntId))
    .map((item) => ({ huntId: item.huntId, title: item.title, state: item.state, ...triage(item.reports) }))
    .filter((item) => item.level !== 'none')
    .sort((a, b) => Number(b.recommendPause) - Number(a.recommendPause))

  return (
    <FocusTemplate
      eyebrow="Frequency Hunts"
      title="Trail moderation"
      description="Review safety reports for Trails you manage."
      width="xl"
      adminBar={false}
    >
      {!authorized ? (
        <EmptyState variant="permission" title="Access required" description="You need permission to review these Trails." />
      ) : !queue ? (
        <EmptyState variant="error" title="Reports unavailable" description="Try again in a moment." />
      ) : queue.length === 0 ? (
        <EmptyState variant="cleared" title="No reports to review" />
      ) : (
        <ul aria-label="Trails with reports" className="space-y-3">
          {queue.map((item) => (
            <li key={item.huntId} className="rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-body font-semibold">{item.title}</h2>
                <Badge tone={item.recommendPause ? 'danger' : 'warning'}>
                  {item.recommendPause ? 'Pause recommended' : 'Review needed'}
                </Badge>
              </div>
              <p className="mt-1 text-body-sm text-muted">
                {item.reporters} {item.reporters === 1 ? 'person reported' : 'people reported'}
              </p>
              {canAct && item.state && item.state !== 'closed' ? <ModerationActions huntId={item.huntId} state={item.state} /> : null}
            </li>
          ))}
        </ul>
      )}
    </FocusTemplate>
  )
}
