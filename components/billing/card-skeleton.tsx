/**
 * A card form's SHAPE, held while the real one is on its way (LIVE-368).
 *
 * 🔴 IT LIVES IN ITS OWN MODULE ON PURPOSE. The card form is behind `dynamic(…, { ssr: false })`
 * so a reader who never buys downloads none of Stripe -- which means a skeleton defined *inside*
 * that chunk cannot be shown until the chunk arrives, and the chunk is one of the things we are
 * waiting for. This file is dependency-free markup, imported eagerly, so it can paint on the very
 * first frame after the click, before the chunk, before the session, before Stripe.js.
 *
 * What it replaces is nothing at all: `loader: 'never'` stops Stripe drawing a second spinner, but
 * it also left the area EMPTY across its own fetch, which put the collapse control directly above
 * "Pay $44" with a void between them.
 *
 * The bars are sized to the Payment Element's real fields -- number, then expiry and CVC side by
 * side, then postal code -- so the box opens at its final height and nothing below it jumps when
 * the fields land.
 *
 * `aria-hidden`, with the wait announced once by a `role="status"` line beside it: a screen reader
 * needs the sentence, not four bars described to it. `motion-safe:` so a reader who asked for less
 * motion gets the shape without the pulse.
 */
export default function CardSkeleton({ label = 'Preparing secure payment…' }: { label?: string }) {
  const bar = 'rounded-control bg-surface-elevated motion-safe:animate-pulse'
  // Staggered, so the four bars read as fields arriving in order rather than one block breathing
  // at once. The delays are inline styles rather than arbitrary classes on purpose: a
  // `[animation-delay:150ms]` would be a class string the design-system scanners have to reason
  // about, and this is presentation with no token to honour.
  const step = (ms: number) => ({ animationDelay: `${ms}ms` })
  return (
    <div className="space-y-2">
      <div className="space-y-2" aria-hidden>
        <div className={`${bar} h-10 w-full`} style={step(0)} />
        <div className="flex gap-2">
          <div className={`${bar} h-10 w-1/2`} style={step(120)} />
          <div className={`${bar} h-10 w-1/2`} style={step(240)} />
        </div>
        <div className={`${bar} h-10 w-full`} style={step(360)} />
      </div>
      <p className="text-meta text-subtle" role="status">
        {label}
      </p>
    </div>
  )
}
