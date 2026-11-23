import type { SiteFooter } from '@/lib/sites/site-footer'

// THE AIDEN TYACK CHROME (LIVE-2517, design: the handoff's ui_kits/site Header and Footer, with Logo and Wordmark from
// ui_kits/_shared/primitives.jsx). PRIVATE to aidentyack.com like its theme.
//
//   · THE LOCKUP: the crossed-hammers mark beside the name in Grenze Gotisch, with a small tracked line under it ("Leathersmith" in
//     the design; the Space's own tagline when it wrote one). A Space that uploaded a logo has its logo in place of the mark.
//   · THE ANNOUNCE BAR: one centred line on the band over the header, the Space's own words (its footer's utility line). A Space
//     with nothing to announce gets no bar.
//
// The mark is the handoff's SVG used as a mask, so it takes the text colour around it: ink on the bone header, bone on the pine
// footer. Every size and colour is the skin's (components/sites/aiden-tyack-css.ts, `.at-*`); nothing here spells a value.

/** The design's line under the name (used until the Space writes a tagline of its own) and its footer credit. */
export const AIDEN_TYACK_CHROME_COPY = { tagline: 'Leathersmith', credit: 'Built on Frequency' } as const

export function AidenTyackMark({ logoUrl = null }: { logoUrl?: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
  return logoUrl ? <img src={logoUrl} alt="" className="at-mark at-mark--img" /> : <span className="at-mark" aria-hidden="true" />
}

export function AidenTyackLogo({ name, tagline = null, logoUrl = null }: { name: string; tagline?: string | null; logoUrl?: string | null }) {
  return (
    <span className="at-logo">
      <AidenTyackMark logoUrl={logoUrl} />
      <span className="at-logo-text">
        <span className="at-logo-name">{name}</span>
        <span className="at-logo-tag">{tagline || AIDEN_TYACK_CHROME_COPY.tagline}</span>
      </span>
    </span>
  )
}

export function AidenTyackBar({ utility = null }: { utility?: SiteFooter['utility'] | null }) {
  const line = utility?.left?.trim()
  if (!line) return null
  return (
    <div className="at-bar">
      <p className="at-bar-line">{line}</p>
    </div>
  )
}
