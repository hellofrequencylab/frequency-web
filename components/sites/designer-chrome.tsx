import { InlineText } from '@/components/sites/inline-text'
import type { SiteFooter } from '@/lib/sites/site-footer'
import { DesignerLetterForm } from './designer-letter-form'

// THE DESIGNER CHROME PIECES (design: the header's utility bar and the footer). Server components over the
// Space's own words (lib/sites/site-footer.ts); every look is the Designer skin's (designer-css.ts).

/** A line that is only a unit (a hash and a number) belongs to the street line before it: the design sets the street and unit as one
 *  line that wraps on its own. The saved footer keeps the lines apart. */
function joinUnits(lines: string[]): string[] {
  return lines.reduce<string[]>((out, l) => (out.length > 0 && l.startsWith('#') ? [...out.slice(0, -1), `${out[out.length - 1]} ${l}`] : [...out, l]), [])
}

/** The strip above the header: the licence on the left, hours, phone and email on the right. */
export function DesignerUtilityBar({ utility }: { utility: NonNullable<SiteFooter['utility']> }) {
  return (
    <div className="dz-util">
      {utility.left && <span className="dz-util-left">{utility.left}</span>}
      <span className="dz-util-items">
        {utility.items.map((i) => (i.href ? <a key={i.label} href={i.href}>{i.label}</a> : <span key={i.label}>{i.label}</span>))}
      </span>
    </div>
  )
}

/** The phone sheet's contact block (design: the call, the email, then the hours): linked items first, plain lines last. */
export function phoneMenuFoot(utility: SiteFooter['utility'] | null): { label: string; href?: string }[] | null {
  if (!utility || utility.items.length === 0) return null
  const items = utility.items.map((i) => ({ label: i.label, ...(i.href ? { href: i.href } : {}) }))
  return [...items.filter((i) => i.href), ...items.filter((i) => !i.href)]
}

/** The footer: the closing band, the brand tile and link columns, the letter sign-up. The legal row is the house footer's. */
export function DesignerFooterTop({ footer, brandName, homeHref, logoUrl, slug }: { footer: SiteFooter | null; brandName: string; homeHref: string; logoUrl: string | null; slug: string | null }) {
  const band = footer?.band ?? null
  const subscribe = footer?.subscribe ?? null
  return (
    <div className="hs-footer-top dz-foot" data-columns={footer?.columns.length ? '' : undefined}>
      {band && (
        <div className="dz-foot-band">
          <h2><InlineText text={band.title} /></h2>
          <div className="dz-actions">
            {band.ctas.map((c, i) => (
              <a key={c.href} className={i === 0 ? 'dz-btn dz-btn-inverse' : 'dz-btn dz-btn-light'} data-size="lg" href={c.href}>
                {c.label}
                {i === 0 && <span className="dz-arrow" aria-hidden="true">→</span>}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="dz-foot-grid" data-subscribe={subscribe ? '' : undefined} style={{ '--dz-foot-cols': footer?.columns.length ?? 0 } as React.CSSProperties}>
        <div className="dz-foot-brand">
          <a href={homeHref} className="hs-brand" aria-label={brandName}>
            {footer?.logo || logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
              <span className="dz-foot-tile"><img src={footer?.logo ?? logoUrl ?? ''} alt={brandName} /></span>
            ) : (
              brandName
            )}
          </a>
          {footer?.blurb && <span className="dz-foot-cslb">{footer.blurb}</span>}
        </div>
        {footer?.columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="hs-footer-col">
            <span className="hs-footer-col-title">{col.title}</span>
            {col.lines.length > 0 && <p>{joinUnits(col.lines).map((l, i, all) => <span key={i}>{l}{i < all.length - 1 && <br />}</span>)}</p>}
            {col.links.length > 0 && (
              <p>{col.links.map((l, i) => <span key={`${l.href}:${l.label}`}><a href={l.href}>{l.label}</a>{i < col.links.length - 1 && <br />}</span>)}</p>
            )}
          </nav>
        ))}
        {subscribe && <DesignerLetterForm slug={slug} {...subscribe} />}
      </div>
    </div>
  )
}
