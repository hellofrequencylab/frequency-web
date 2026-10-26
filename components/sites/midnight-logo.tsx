import { MidnightSeal } from '@/components/sites/midnight-sigil'

// The Midnight logo lockup (design: LogoMark + SiteLogo): a ringed waxing-moon seal, the name in the display face,
// and the Space's tagline under it in the label face. The ring, glow and type come from the skin (.mn-logo*), so
// nothing here spells a colour. With no tagline the name sits alone, centred on the ring.

export function MidnightLogo({ name, tagline, size = 44 }: { name: string; tagline?: string | null; size?: number }) {
  return (
    <span className="mn-logo">
      <span className="mn-logo-ring"><MidnightSeal name="moon-waxing" size={size} tone="accent" /></span>
      <span className="mn-logo-text">
        <span className="mn-logo-name">{name}</span>
        {tagline ? <span className="mn-logo-tag">{tagline}</span> : null}
      </span>
    </span>
  )
}
