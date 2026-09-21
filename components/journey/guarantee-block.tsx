import { ShieldCheck } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'

// THE REFUND PROMISE A HOST WROTE (LIVE-395), rendered where the decision is made.
//
// ADR-1398 listed this as not done and it stayed that way: `revokeJourneyByOrder` has performed the
// mechanics of a full refund the whole time, so the policy had an implementation and no way to say
// itself to the person deciding whether to spend $444.
//
// ITS OWN FILE, not a widget in discovery-widgets.tsx. It is not part of the discovery layout a host
// reorders (`enabledWidgets`) — it is a fixed reassurance that sits after the objections, so putting
// it in the widget bag would offer a control that does nothing. Keeping it separate also keeps it
// clear of LIVE-394, which is rewriting the widgets file.
//
// DEGRADES TO NOTHING, like every other block on the sales body: a host who has written no guarantee
// gets no empty shell and no default promise the platform invented on their behalf.

export function JourneyGuaranteeBlock({ guarantee }: { guarantee: string }) {
  if (!guarantee) return null
  return (
    <section>
      <SectionHeader title="Your guarantee" />
      {/* `rounded-card`, not the `rounded-2xl` the older blocks beside this one still carry:
          --radius-card is 24px, so this is value-identical today and follows the skin tomorrow. */}
      <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-5 lift-1">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <p className="text-body-sm leading-relaxed text-text">{guarantee}</p>
      </div>
    </section>
  )
}
