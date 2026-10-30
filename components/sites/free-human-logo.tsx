// THE FREE HUMAN LOGO LOCKUP (design: the header's wordmark and the footer's). The kit's gilt arch mark (a Space that uploaded a
// logo has it set in the mark's place), the name in the display face with its last word in the lyric italic, and the tagline as the
// inscription under it. Every size, colour and shadow comes from the skin (.fh-logo*, free-human-chrome-css.ts); nothing here spells one.

/** The name split for the lockup: all but the last word, and the last word set in the lyric italic. A one-word name is plain. */
function nameParts(name: string): { lead: string; em: string | null } {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return { lead: name.trim(), em: null }
  return { lead: words.slice(0, -1).join(' '), em: words[words.length - 1] }
}

/** The design sets the tagline as an inscription: "Embody. Create. Rise." reads EMBODY \u2022 CREATE \u2022 RISE. */
function inscription(tagline: string): string {
  const words = tagline.split(/[.\u2022]/).map((w) => w.trim()).filter(Boolean)
  return words.length > 1 ? words.join(' \u2022 ') : tagline.trim()
}

export function FreeHumanLogo({ name, tagline = null, logoUrl = null, dark = false }: { name: string; tagline?: string | null; logoUrl?: string | null; dark?: boolean }) {
  const { lead, em } = nameParts(name)
  return (
    <span className="fh-logo">
      {/* eslint-disable-next-line @next/next/no-img-element -- the kit's own mark under /public, or the operator's logo on an arbitrary host */}
      <img src={logoUrl ?? (dark ? '/sites/free-human/logo-mark-dark.svg' : '/sites/free-human/logo-mark.svg')} alt="" className="fh-logo-mark" width={38} height={48} />
      <span className="fh-logo-text">
        <span className="fh-logo-name">
          {lead}
          {em ? <> <em>{em}</em></> : null}
        </span>
        {tagline ? <span className="fh-logo-tag">{inscription(tagline)}</span> : null}
      </span>
    </span>
  )
}
