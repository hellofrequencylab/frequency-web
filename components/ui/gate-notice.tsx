import { Children, isValidElement } from 'react'
import { GraduationCap, Hourglass, Moon, Sparkles, X } from 'lucide-react'
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
// Server-friendly by default (no hooks, no state). Passing `onDismiss` is what
// makes a call site a client one, exactly as any handler prop does.
//
//   <GateNotice kind="dormant" />
//   <GateNotice kind="gated" title="Hosts room">Opens when you host your first event.</GateNotice>
//
// ── THE WIDENING (PROG-DAWN2, 2026-08-24) ────────────────────────────────────
// The beta grace notice (components/upsell/beta-grace-notice.tsx) is a gate
// notice that was wearing its own box. Three gaps kept it out, none of them a
// matter of taste. All three are closed here, and that one caller exercises
// each of them:
//   1. A BODY OF MORE THAN ONE PARAGRAPH. `children` used to land inside the
//      body <p>. A <p> inside a <p> is not a style problem: the HTML parser
//      auto-closes the outer one, so the markup the server streams and the tree
//      React expects disagree and the notice hydrates wrong. A body carrying
//      block children now gets a <div> stack; a text body keeps the <p> it has
//      always had, so every existing caller renders byte for byte the same.
//   2. `action` — one control under the body (the DAWN reference kit carries
//      this slot; production dropped it). Without it a notice with a CTA had to
//      keep its own frame just to hold the link.
//   3. `onDismiss` — a notice a member may put away. Without it a dismissible
//      notice had to own its own layout to place the close control.
// None of the three is speculative: remove any one and the beta grace notice
// goes back to hand-rolling the whole box.

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

/** The body's type role, shared by both wrappers so the two branches can never drift apart. */
const BODY_CLASS = 'mt-0.5 text-body-sm text-muted'

export function GateNotice({
  kind,
  title,
  children,
  action,
  onDismiss,
}: {
  kind: GateKind
  /** Overrides the kind's default title. */
  title?: string
  /** Overrides the kind's default body copy. Text stays one paragraph; pass block
   *  elements (two <p>s, a list) and the body becomes a stack of them. */
  children?: React.ReactNode
  /** One control under the body: the door out, or the thing that IS available. */
  action?: React.ReactNode
  /** Makes the notice dismissible. A handler prop, so only a client caller may pass it. */
  onDismiss?: () => void
}) {
  const k = KIND[kind]
  const body = children ?? k.body
  // Does the body carry block elements? Only then does the <p> have to become a stack —
  // see gap 1 above. Text and interpolated text (the room notice's `{r.name}`) are an
  // array of strings here, so they keep the paragraph.
  const blockBody = Children.toArray(body).some(isValidElement)
  return (
    <div
      data-kind={kind}
      className={`flex items-start gap-3 rounded-card border bg-surface-elevated/50 px-4 py-3 ${k.frame}`}
    >
      <k.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${k.tone}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-body-sm font-semibold text-text">{title ?? k.title}</p>
        {blockBody ? (
          <div className={`${BODY_CLASS} space-y-2`}>{body}</div>
        ) : (
          <p className={BODY_CLASS}>{body}</p>
        )}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
      {onDismiss ? (
        // `ml-auto` rather than a place in the body column, so a notice WITHOUT a dismiss
        // control renders exactly the markup it did before this slot existed.
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 ml-auto shrink-0 rounded-control p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
