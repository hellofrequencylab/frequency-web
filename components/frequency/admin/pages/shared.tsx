import type { CSSProperties, ReactNode } from 'react'
import '@/app/themes/frequency/admin-pages.css'

// THE MEMBER ADMIN PAGE KIT (Frequency, ADR-1740). The pieces every admin page body repeats, written once:
// the body root, the page head, a KPI card and an avatar. Server-safe, no client JS. The bodies reproduce
// design_handoff/frequency/templates/admin/*.html with the kit class names verbatim; the admin shell lane
// owns the sidebar, the top bar and `.ad-main` around them.
//
// THE EMPTY VALUE. A design KPI this platform has no reading for renders `EMPTY` ("—"), the design's own
// empty value, and never a made-up number. Each body lists its empties in a comment beside the KPI.

/** The design's empty value for a KPI with no reading. */
export const EMPTY = '—'

/** The body root. `data-kit="members"` because the admin console reuses the members kit (buttons, panels,
 *  type), exactly as the design's pages load app.css beside admin.css. */
export function AdminPageBody({ children }: { children: ReactNode }) {
  return (
    <div className="adp" data-kit="members">
      {children}
    </div>
  )
}

/** The page head: kicker, title, meta line, and the actions on the right. `level` is 'h2' when the body
 *  sits under a host page that already owns the h1 (one h1 per page). */
export function AdminHead({
  kicker,
  title,
  meta,
  actions,
  level = 'h1',
}: {
  kicker: ReactNode
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  level?: 'h1' | 'h2'
}) {
  const Heading = level
  return (
    <div className="head">
      <div>
        <span className="k">{kicker}</span>
        <Heading className="h1">{title}</Heading>
        {meta ? <span className="meta">{meta}</span> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </div>
  )
}

/** One KPI card (`.panel.kpi`). `trend` is the `.up` / `.down` line; `note` is a plain `.t2` line instead.
 *  Omit both when the platform has no comparison to show. */
export function Kpi({
  label,
  value,
  trend,
  note,
}: {
  label: string
  value: ReactNode
  trend?: { dir: 'up' | 'down'; text: string }
  note?: ReactNode
}) {
  return (
    <div className="panel kpi">
      <span className="t2">{label}</span>
      <span className="num">{value}</span>
      {trend ? <span className={trend.dir}>{trend.text}</span> : note ? <span className="t2">{note}</span> : null}
    </div>
  )
}

/** A small avatar (`.av.s`): the photo as a background, the kit's tinted disc when there is none. */
export function Av({ url, size = 's' }: { url?: string | null; size?: 's' | 'm' }) {
  const style: CSSProperties | undefined = url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined
  return <span className={`av ${size}`} style={style} aria-hidden />
}

/** Whole-number formatting the tables share (tabular, grouped). */
export function n(value: number): string {
  return value.toLocaleString('en-US')
}

/** Dollars from cents, whole when the cents are zero (design: "$3,420", "$18"). */
export function usd(cents: number): string {
  const v = (cents || 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v)
}
