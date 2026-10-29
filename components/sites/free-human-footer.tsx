import { FreeHumanLogo } from '@/components/sites/free-human-logo'
import { FreeHumanLetterForm } from '@/components/sites/free-human-letter-form'
import { FREE_HUMAN_CHROME_COPY as COPY } from '@/lib/sites/free-human-chrome'
import { templeKitFooterColumns, templeKitLetterParts } from '@/lib/sites/temple-kit-chrome'
import type { SiteFooter } from '@/lib/sites/site-footer'

// THE FREE HUMAN FOOTER (design: the sky footer of Website.dc.html). A turning emblem of rays and a halo, the letter (title with its
// last phrase in the gilt lyric italic, one line, one underlined field and a gilt Subscribe), then a gilt rule over the brand with
// its blurb and three link columns. The Space's own saved columns and sign-up words win; otherwise its menu is sorted into the
// design's three columns. The wanderers (six gold motes) and the water texture are the skin's (.fh-tex-water-light, .fh-wander).

const MOTES = [
  { x: '10%', y: '30%', s: '3px', d: '90s', delay: '-5s', k: '' },
  { x: '26%', y: '60%', s: '2px', d: '110s', delay: '-40s', k: 'b' },
  { x: '44%', y: '20%', s: '3px', d: '96s', delay: '-22s', k: 'c' },
  { x: '64%', y: '46%', s: '2px', d: '120s', delay: '-60s', k: '' },
  { x: '80%', y: '24%', s: '3px', d: '100s', delay: '-15s', k: 'b' },
  { x: '92%', y: '70%', s: '2px', d: '104s', delay: '-70s', k: 'c' },
] as const

export function FreeHumanFooterTop({ brandName, homeHref, tagline, logoUrl, links, footer, slug }: { brandName: string; homeHref: string; tagline: string | null; logoUrl: string | null; links: { label: string; href: string }[]; footer: SiteFooter | null; slug: string | null }) {
  const L = COPY.letter
  const sub = footer?.subscribe ?? null
  const parts = templeKitLetterParts(sub?.title ?? L.title)
  const columns = templeKitFooterColumns(links, footer?.columns ?? null)
  const blurb = footer?.blurb ?? tagline
  return (
    <>
      <div className="fh-tex-water-light fh-footer-tex" aria-hidden />
      <div className="fh-wander" aria-hidden>
        {MOTES.map((m) => (
          <i key={m.x} className={`fh-mote ${m.k}`} style={{ '--x': m.x, '--y': m.y, '--s': m.s, '--d': m.d, '--delay': m.delay } as React.CSSProperties} />
        ))}
      </div>
      <div className="fh-footer-letter">
        <div className="fh-footer-emblem" aria-hidden>
          <div className="fh-rays fh-turn" />
          <div className="fh-halo fh-breathe" />
        </div>
        <p className="fh-letter-title">
          {parts.map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}
        </p>
        {!sub && <p className="fh-letter-body">{L.body}</p>}
        <FreeHumanLetterForm slug={slug} label={L.label} placeholder={sub?.placeholder ?? L.placeholder} buttonLabel={sub?.button ?? L.button} successMessage={sub?.success ?? L.done} />
      </div>
      <div className="fh-footer-grid">
        <div className="fh-footer-brand">
          <a href={homeHref} className="fh-footer-home" aria-label={`${brandName} home`}>
            <FreeHumanLogo name={brandName} tagline={tagline} logoUrl={logoUrl} dark />
          </a>
          {blurb && <p className="fh-footer-blurb">{blurb}</p>}
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="fh-footer-col">
            <span className="fh-footer-col-title">{col.title}</span>
            {col.links.map((l) => (
              <a key={`${l.href}:${l.label}`} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
        ))}
      </div>
    </>
  )
}
