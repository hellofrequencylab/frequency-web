import type { ReactNode } from 'react'
import Link from 'next/link'
import { Timer, CheckCircle2, Footprints, SlidersHorizontal } from 'lucide-react'
import { capsLabel } from '@/components/ui/caps-label'
import { describeTimer, type TimerConfigInput } from '@/lib/practices/timer-setups'

// THE TIMER PANEL on a Practice page (LIVE-2396). How this Practice is done, in plain words, with
// the one action that does it. Before this the page said it in a single grey pill and offered a
// small secondary button, so a member could not tell what Start would open, and an author could
// not tell whether their timer was set.
//
// The words are `describeTimer`'s, the same ones the editor shows under "Members will see", so
// what an author ships and what a member reads cannot drift apart. `data-energy` hands the card
// the member kit's own energy (still for Be Still, charge for Get Moving), which is how Get
// Moving wears its own colour without a single colour being named here.

export function PracticeTimerPanel({
  config,
  action,
  setupHref,
}: {
  config: TimerConfigInput
  /** The Start Practice or Log it control, when this member can do the Practice. */
  action?: ReactNode
  /** The editor's Timer section, shown to the author only. */
  setupHref?: string | null
}) {
  const timer = describeTimer(config)
  const Icon = timer.mode === 'Log it' ? CheckCircle2 : timer.mode === 'Get Moving' ? Footprints : Timer
  return (
    <section
      aria-label="How this practice is done"
      data-energy={timer.energy}
      className="mb-6 rounded-card border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-primary-strong">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className={capsLabel('text-2xs font-semibold text-muted')}>
            {timer.mode === 'Log it' ? 'No timer' : `${timer.mode} timer`}
          </p>
          <p className="mt-0.5 text-card-title font-bold text-text">{timer.headline}</p>
          <ul className="mt-1.5 space-y-0.5 text-body-sm text-muted">
            {timer.facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
          {setupHref && (
            <p className="mt-2 text-body-sm">
              <Link href={setupHref} className="inline-flex items-center gap-1.5 font-semibold text-primary-strong hover:underline">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                {timer.unset ? 'Set up the timer' : 'Change the timer'}
              </Link>
              {timer.unset && <span className="text-muted"> so it opens ready for everyone.</span>}
            </p>
          )}
        </div>
        {action && <div className="flex w-full shrink-0 items-center sm:w-auto sm:self-center">{action}</div>}
      </div>
    </section>
  )
}
