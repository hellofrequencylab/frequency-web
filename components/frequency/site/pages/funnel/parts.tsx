// Shared pieces for the lane-E bodies (funnel, niche, comparison, capture and claim pages) on the
// Frequency design, written in the "site" kit's own class names plus app/themes/frequency/site-funnel.css.
// Server-safe: no hooks, no client JS. The site shell (lane A) owns the kit root, header, footer and FX;
// these render the page between them.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import '@/app/themes/active/site-pages-b'
import '@/app/themes/active/site-funnel'

/** A page hero without a photo: kicker, h1, one lede, optional meta line and actions. */
export function FnHero({
  kicker,
  title,
  lede,
  meta,
  center,
  full,
  children,
}: {
  kicker?: ReactNode
  title: ReactNode
  lede?: ReactNode
  meta?: ReactNode
  center?: boolean
  /** The hero is the whole page (one promise, one button): it takes most of the first screen. */
  full?: boolean
  /** Actions under the lede (a `.ctas` row is the usual child). */
  children?: ReactNode
}) {
  return (
    <section className={`fn-hero${center ? ' fn-c' : ''}${full ? ' fn-full' : ''}`} data-screen-label="01 Hero">
      <span className="rings" aria-hidden="true" />
      <div className="wrap">
        {kicker && (
          <div className="label">
            <b>{kicker}</b>
          </div>
        )}
        <h1 className="h-xl">{title}</h1>
        {lede && <p className="fn-lede">{lede}</p>}
        {meta && <p className="fn-meta">{meta}</p>}
        {children}
      </div>
    </section>
  )
}

/** The kit's photo hero (`.phero`), as Pricing draws it: a real photo under the shade, the kicker, the h1,
 *  one paragraph and the actions. The photo is decorative behind the copy, so it carries no alt. */
export function FnPhotoHero({
  image,
  kicker,
  title,
  lede,
  children,
}: {
  image: string
  kicker?: ReactNode
  title: ReactNode
  lede?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="phero" data-energy="flow" data-screen-label="01 Hero">
      <div className="bg" style={{ backgroundImage: `url('${image}')` }} />
      <div className="fq-aura" style={{ '--fq-aura-opacity': 0.3 } as React.CSSProperties} />
      <div className="shade" />
      <div className="fq-grain" />
      <div className="wrap">
        {kicker && <span className="fn-pk">{kicker}</span>}
        <h1 className="h-xl">{title}</h1>
        {lede && <p>{lede}</p>}
        {children}
      </div>
    </section>
  )
}

/** A section heading in the kit's `.sh` grammar: the label line, then the h2. */
export function FnHead({ label, sub, title, note }: { label: string; sub?: string; title: ReactNode; note?: ReactNode }) {
  return (
    <div className="sh">
      <div className="label">
        <b>{label}</b>
        {sub}
      </div>
      <h2 className="h-l">{title}</h2>
      {note && <p className="pb-note">{note}</p>}
    </div>
  )
}

/** The single-action column: a centred card that holds a form, an outcome or a timer. */
export function FnColumn({ children, label = '02 Action' }: { children: ReactNode; label?: string }) {
  return (
    <section className="fn-sec" data-screen-label={label}>
      <div className="wrap">
        <div className="fn-col">{children}</div>
      </div>
    </section>
  )
}

export interface FnAction {
  href: string
  label: string
}

/** One outcome, one action: a done, a dead link, a cancelled event. `as` sets the heading level, so an
 *  outcome that replaces a whole page is the h1 and one that replaces a form under a hero is an h2. */
export function FnOutcome({
  tone = 'side',
  icon,
  title,
  children,
  action,
  as = 'h2',
  role,
}: {
  tone?: 'side' | 'success' | 'danger'
  icon: FqIconName
  title: ReactNode
  children?: ReactNode
  action?: FnAction | ReactNode
  as?: 'h1' | 'h2'
  role?: 'status' | 'alert'
}) {
  const Heading = as
  const act =
    action && typeof action === 'object' && 'href' in (action as FnAction) ? (
      <div className="ctas">
        <Link className="btn fq-iri-btn" href={(action as FnAction).href}>
          {(action as FnAction).label}
        </Link>
      </div>
    ) : (
      (action as ReactNode)
    )
  return (
    <div className="fn-box fn-out" data-tone={tone} role={role}>
      <span className="fn-dot" aria-hidden="true">
        <FqIcon name={icon} />
      </span>
      <Heading>{title}</Heading>
      {children && <p>{children}</p>}
      {act}
    </div>
  )
}

/** The first screen holding one centred box: a capture door, a confirm step, an outcome. */
export function FnStage({ children, label = '01 Action' }: { children: ReactNode; label?: string }) {
  return (
    <section className="fn-hero fn-c fn-full" data-screen-label={label}>
      <span className="rings" aria-hidden="true" />
      <div className="wrap">
        <div className="fn-col">{children}</div>
      </div>
    </section>
  )
}

/** A whole page that is only an outcome (an invalid token, a finished step): the hero is the outcome. */
export function FnOutcomePage(props: Omit<Parameters<typeof FnOutcome>[0], 'as'>) {
  return (
    <FnStage label="01 Outcome">
      <FnOutcome {...props} as="h1" />
    </FnStage>
  )
}

/** The skeleton a token-reading page shows while it verifies: the box at the outcome's size. */
export function FnOutcomeSkeleton() {
  return (
    <section className="fn-hero fn-c fn-full" aria-busy="true" aria-label="Loading">
      <div className="wrap">
        <div className="fn-col">
          <div className="fn-box">
            <span className="hp-skel" style={{ width: 44, height: 44, borderRadius: '50%' }} />
            <span className="hp-skel" style={{ height: 32, width: '70%' }} />
            <span className="hp-skel" style={{ height: 18 }} />
            <span className="hp-skel" style={{ height: 18, width: '80%' }} />
          </div>
        </div>
      </div>
    </section>
  )
}
