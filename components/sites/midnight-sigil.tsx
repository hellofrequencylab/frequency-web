import { MIDNIGHT_SIGILS } from '@/lib/theme/midnight-sigils'

// A Midnight sigil (design: components/core/Sigil.jsx): one monoline astrological or alchemical symbol on a 24px
// grid, drawn in currentColor, so the skin sets its colour and nothing here spells one.

export const MIDNIGHT_SIGIL_NAMES = Object.keys(MIDNIGHT_SIGILS)

export function MidnightSigil({ name, size = 20, stroke = 1.25 }: { name: string; size?: number; stroke?: number }) {
  const inner = MIDNIGHT_SIGILS[name] ?? MIDNIGHT_SIGILS['moon-new']
  return (
    <svg className="mn-sigil" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner }} />
  )
}

/** Seal (design: components/elements/Seal.jsx): a sigil held in a hairline ring with a faint outer ring. */
export function MidnightSeal({ name, size = 56, tone = 'subtle' }: { name: string; size?: number; tone?: 'subtle' | 'accent' }) {
  return (
    <span className="mn-seal" data-tone={tone} style={{ width: size, height: size }}>
      <MidnightSigil name={name} size={Math.round(size * 0.4)} />
    </span>
  )
}
