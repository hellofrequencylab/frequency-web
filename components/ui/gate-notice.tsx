import { GraduationCap, Hourglass, Moon, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// GateNotice — the built-but-dormant vocabulary (DAWN 2026-08-03 §5; BRIEF-06
// §10). One calm pattern for every "this exists but is not on for you yet"
// moment, so pages never invent their own warning boxes. Four kinds:
//   • preview — the feature is visible and free while billing is off in beta.
//   • gated   — behind graduation or a plan tier; arrives, is not withheld.
//   • dormant — built and waiting on setup (AI, SMS, push awaiting keys).
//   • hold    — deliberately parked (e.g. white-label sites).
// Tone rule: quiet, never alarmist, and NO padlock iconography — a Space never
// wears a lock (the boundary is explained, not brandished).
//
// Default title + body per kind; pass `title` and/or `children` to override.
// Presentational + server-friendly (no hooks).
//
//   <GateNotice kind="dormant" />
//   <GateNotice kind="gated" title="Hosts room">Opens when you host your first event.</GateNotice>

export type GateKind = 'preview' | 'gated' | 'dormant' | 'hold'

const KIND: Record<
  GateKind,
  { Icon: LucideIcon; tone: string; frame: string; title: string; body: string }
> = {
  preview: {
    Icon: Sparkles,
    tone: 'text-info',
    frame: 'border-border',
    title: 'Free during the beta',
    body: 'This is live for everyone right now. Billing turns on later, and we will say so well before it does.',
  },
  gated: {
    Icon: GraduationCap,
    tone: 'text-primary',
    frame: 'border-border',
    title: 'This opens later',
    body: 'It comes with graduation or a plan step. Everything you have now keeps working.',
  },
  dormant: {
    Icon: Moon,
    tone: 'text-subtle',
    frame: 'border-dashed border-border',
    title: 'Not switched on yet',
    body: 'This part is built and waiting on setup. It will appear here once it is connected.',
  },
  hold: {
    Icon: Hourglass,
    tone: 'text-muted',
    frame: 'border-dashed border-border',
    title: 'Parked for now',
    body: 'We built this and set it aside on purpose. It comes back when the time is right.',
  },
}

export function GateNotice({
  kind,
  title,
  children,
}: {
  kind: GateKind
  /** Overrides the kind's default title. */
  title?: string
  /** Overrides the kind's default body copy. */
  children?: React.ReactNode
}) {
  const k = KIND[kind]
  return (
    <div
      data-kind={kind}
      className={`flex items-start gap-3 rounded-card border bg-surface-elevated/50 px-4 py-3 ${k.frame}`}
    >
      <k.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${k.tone}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{title ?? k.title}</p>
        <p className="mt-0.5 text-sm text-muted">{children ?? k.body}</p>
      </div>
    </div>
  )
}
