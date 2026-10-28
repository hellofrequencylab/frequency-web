import { Users } from 'lucide-react'

// The Network Theme Kit logo lockup (design: LogoMark + SiteLogo): the Space's logo, or the group icon, on a solid
// accent disc ringed in a hairline, then the name in the display face and the tagline under it. The disc, ring and
// type come from the skin (.nk-logo*), so nothing here spells a colour. With no tagline the name sits alone.

export function NetworkKitLogo({ name, tagline, logoUrl = null }: { name: string; tagline?: string | null; logoUrl?: string | null }) {
  return (
    <span className="nk-logo">
      <span className="nk-logo-mark" aria-hidden>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
          <img src={logoUrl} alt="" />
        ) : (
          <Users width="46%" height="46%" strokeWidth={2} aria-hidden />
        )}
      </span>
      <span className="nk-logo-text">
        <span className="nk-logo-name">{name}</span>
        {tagline ? <span className="nk-logo-tag">{tagline}</span> : null}
      </span>
    </span>
  )
}
