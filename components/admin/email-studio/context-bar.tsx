import { CalendarClock, Layers, Megaphone, Users } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import type { EmailEditorContext } from '@/app/(main)/admin/email-studio/actions'

// EMAIL STUDIO CONTEXT BAR (Email plan P2, ask #7). A slim orientation bar that sits ABOVE the email canvas
// and names where the writer is: the campaign or sequence, the step (Email 2 of 5), the trigger/timing, the
// audience, and the status with the DAWN status legend. For a standalone broadcast it names the campaign,
// audience, and schedule instead. Every field is resolved server-side (loadEmailCampaign -> EmailEditorContext);
// this component is pure presentation. Semantic DAWN tokens only (no hex); voice canon (no em dashes).

/** Status → the legend glyph + chip tone. Uses the DAWN status legend (see docs/PRESENTATION.md). */
const STATUS_META: Record<string, { glyph: string; label: string; tone: StatusTone }> = {
  draft: { glyph: '✏️', label: 'Draft', tone: 'neutral' },
  scheduled: { glyph: '⏳', label: 'Scheduled', tone: 'info' },
  sending: { glyph: '⏳', label: 'Sending', tone: 'info' },
  sent: { glyph: '✅', label: 'Sent', tone: 'success' },
  paused: { glyph: '⏸️', label: 'Paused', tone: 'warning' },
  cancelled: { glyph: '🔴', label: 'Cancelled', tone: 'danger' },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { glyph: '✏️', label: status || 'Draft', tone: 'neutral' as StatusTone }
}

/** One inline fact in the bar: a small icon + text. Facts are separated by a subtle bullet. */
function Fact({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
      {children}
    </span>
  )
}

function Divider() {
  return (
    <span className="text-subtle" aria-hidden>
      ·
    </span>
  )
}

export function EmailContextBar({ context }: { context: EmailEditorContext }) {
  const { kind, campaignName, audience, schedule, step } = context
  const meta = statusMeta(context.status)
  const LeadIcon = kind === 'sequence' ? Layers : Megaphone

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-border bg-surface-elevated/40 px-4 py-2.5"
      aria-label="Email context"
    >
      {/* The container this email belongs to: the sequence name, or the campaign subject for a broadcast. */}
      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-text">
        <LeadIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        {campaignName}
      </span>

      {/* Step position + its trigger/timing, only when this email is one step of a sequence. */}
      {step && (
        <>
          <Divider />
          <span className="text-xs font-semibold text-text">
            Email {step.position} of {step.total}
          </span>
          {step.timing && (
            <>
              <Divider />
              <Fact icon={CalendarClock}>{step.timing}</Fact>
            </>
          )}
        </>
      )}

      {/* Audience (always shown). */}
      <Divider />
      <Fact icon={Users}>{audience}</Fact>

      {/* Schedule, for a standalone broadcast (a sequence step already shows its timing above). */}
      {!step && (
        <>
          <Divider />
          <Fact icon={CalendarClock}>{schedule}</Fact>
        </>
      )}

      {/* Status, with the DAWN status legend glyph. Pushed to the end of the bar. */}
      <span className="ml-auto inline-flex items-center gap-1.5">
        <StatusChip tone={meta.tone} size="sm">
          <span aria-hidden>{meta.glyph}</span>
          {meta.label}
        </StatusChip>
      </span>
    </div>
  )
}
