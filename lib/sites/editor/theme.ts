import type { CSSProperties } from 'react'
import contract from './theme-contract.json'
import { MENSWORK_SEASONS, mensworkSeason, mensworkAccentVars } from '@/lib/theme/menswork'
import type { WebsiteTheme } from './state'

export function websiteThemeVars(theme: WebsiteTheme, brandAccent?: string | null, date = new Date()): CSSProperties {
  const tokens: Record<string, string> = {}
  for (const [key, value] of Object.entries(contract.themes[theme])) if (typeof value === 'string') tokens[key] = value
  if (theme === 'Menswork') {
    tokens['--th-season'] = MENSWORK_SEASONS[mensworkSeason(date)]
  }
  if (theme === 'Menswork' || (typeof brandAccent === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(brandAccent))) {
    const accent = mensworkAccentVars(brandAccent)
    if (accent) {
      tokens['--th-accent'] = accent['--color-primary']!
      tokens['--th-accent-text'] = accent['--color-primary-strong']!
      tokens['--th-on-accent'] = accent['--color-text-on-primary']!
    }
  }
  // next/font registers generated family names. Bind the handoff's named faces
  // to those same local font variables, retaining the contract as the fallback.
  const fonts = theme === 'Menswork' ? ['sofia-xc', 'barlow', 'plex-mono'] : ['anton', 'nunito', 'geist-mono']
  for (const [index, role] of ['display', 'body', 'mono'].entries()) tokens[`--th-${role}-render`] = `var(--font-${fonts[index]}, ${tokens[`--th-${role}`]})`
  return { ...tokens, ...contract.derived } as CSSProperties
}

// All aliases point at the active website tokens, including shared FieldForm controls.
export const WEBSITE_TOKEN_CSS = `
[data-website-theme]{
 --color-canvas:var(--th-bg);--color-marketing-canvas:var(--th-bg);
 --color-surface:var(--th-surface);--color-surface-elevated:var(--th-raised);
 --color-border:var(--th-hairline);--color-border-strong:var(--th-muted);
 --color-text:var(--th-text);--color-text-muted:var(--th-secondary);--color-text-subtle:var(--th-muted);
 --color-primary:var(--th-accent);--color-primary-hover:var(--th-accent);--color-primary-strong:var(--th-accent-text);
 --color-primary-bg:color-mix(in srgb,var(--th-accent) 14%,transparent);--color-text-on-primary:var(--th-on-accent);
 --font-display:var(--th-display-render);--font-body:var(--th-body-render);--font-mono:var(--th-mono-render);
 background:var(--th-bg);color:var(--th-text);font-family:var(--th-body-render);
}
[data-website-theme] .hs-root{background:var(--th-bg);color:var(--th-text)}
[data-website-theme] .hs-h1,[data-website-theme] .hs-h2{font-family:var(--th-display-render);font-weight:var(--th-dw)}
`
