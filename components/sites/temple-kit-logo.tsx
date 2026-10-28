// THE TEMPLE KIT LOGO LOCKUP (design: LogoMark + SiteLogo in ui_kits/site/Header.jsx). An arch niche (44 by 50) holding the
// kit's mark, the name in the hero face and, on the large lockup, the Space's tagline as a small eyebrow under it. A Space that
// uploaded a logo has it set inside the niche in place of the mark. Every size, colour and ring comes from the skin
// (.tk-logo*, temple-kit-chrome-css.ts, which also draws the small lockup under 1280); nothing here spells a value.

/** The kit's "arc" mark: a ring with a waxing half filled (the design's sigil:arc). */
export function TempleKitSigil({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4A8 8 0 0 1 12 20A4.5 8 0 0 0 12 4Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TempleKitMark({ logoUrl = null, size = 44 }: { logoUrl?: string | null; size?: number }) {
  return (
    <span className="tk-mark" aria-hidden="true">
      <span className="tk-mark-ring" />
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
        <img src={logoUrl} alt="" className="tk-mark-img" />
      ) : (
        <TempleKitSigil size={Math.round(size * 0.42)} />
      )}
    </span>
  )
}

export function TempleKitLogo({ name, tagline = null, logoUrl = null }: { name: string; tagline?: string | null; logoUrl?: string | null }) {
  return (
    <span className="tk-logo">
      <TempleKitMark logoUrl={logoUrl} size={44} />
      <span className="tk-logo-text">
        <span className="tk-logo-name">{name}</span>
        {tagline ? <span className="tk-logo-tag">{tagline}</span> : null}
      </span>
    </span>
  )
}
