import type { CSSProperties } from 'react'
import { resolveAccentVars, type AccentVars } from '@/lib/spaces/accent'
import { mensworkAccentVars } from '@/lib/theme/menswork'
import { wildheartAccentVars } from '@/lib/theme/wildheart'
import { networkAccentVars } from '@/lib/theme/network'
import { SPACE_THEMES, SPACE_THEME_FONT_VARS, type SpaceThemeId } from '@/lib/theme/space-themes'
import type { SiteStyle, SiteThemeId } from '@/lib/theme/site-style'
import { websiteThemeVars } from '@/lib/sites/editor/theme'
import type { WebsiteTheme } from '@/lib/sites/editor/state'

// HOW A SITE PAGE LOOKS, resolved ONCE for both the live site (components/sites/site-page.tsx) and the website
// editor's canvas (components/sites/editor/shell.tsx). Before this the editor guessed on its own: a Frequency
// site wore the DAWN contract's Anton and amber in the preview while the live page wore the owner's font set
// and brand accent. One resolver means the preview is the published page.
//
// Input is the style ONE PAGE wears (sitePageStyle / readSitePageStyle, so a page theme counts), the brand
// accent the page resolves (the website's own over the Space's, lib/sites/site-brand.ts) and the Space type's
// default accent.

/** The editor's stored theme id for each site theme (ADR-1726): Bold is Menswork, Frequency is DAWN. */
export const EDITOR_THEME_OF: Record<SiteThemeId, WebsiteTheme> = { frequency: 'DAWN', bold: 'Menswork', wildheart: 'Wildheart', network: 'Network' }

interface SiteRenderStyle {
  /** The site theme this page wears. */
  theme: SiteThemeId
  /** The same theme under the editor's id (the `data-website-theme` value and websiteThemeVars key). */
  editorTheme: WebsiteTheme
  /** Bold, Wildheart and Network dress the page in their own skin; Frequency wears the house sheets. */
  skinned: boolean
  /** The font set the page wears (the AccentScope `data-space-theme`): Bold always its own, otherwise the
   *  owner's website font set (ADR-1726). */
  fonts: SpaceThemeId
  /** The brand accent the AccentScope paints (`--color-primary*`). */
  accentVars: AccentVars | null
  /** The brand accent itself (hex or token), as the skins measure it. */
  accent: string | null
  /** The style the global looks (corners, spacing, header, footer) resolve over. */
  lookStyle: SiteStyle
}

export function siteRenderStyle(pageStyle: SiteStyle, accent: string | null | undefined, typeDefaultAccent: string | null): SiteRenderStyle {
  const theme = pageStyle.theme
  const brandAccent = accent ?? null
  const accentVars =
    theme === 'bold'
      ? mensworkAccentVars(brandAccent)
      : theme === 'wildheart'
        ? wildheartAccentVars(brandAccent)
        : theme === 'network'
          ? networkAccentVars(brandAccent)
          : resolveAccentVars(brandAccent, typeDefaultAccent)
  return {
    theme,
    editorTheme: EDITOR_THEME_OF[theme],
    skinned: theme !== 'frequency',
    fonts: theme === 'bold' ? 'menswork' : pageStyle.fonts,
    accentVars,
    accent: brandAccent,
    lookStyle: pageStyle,
  }
}

/** The website tokens (`--th-*`) the editor canvas wears for a resolved page. A skinned theme wears its own
 *  contract with the brand accent, exactly the wrapper the live site sets. A Frequency page keeps the DAWN
 *  contract's surfaces but takes its faces from the font set and its accent from the AccentScope vars, the two
 *  things the live page reads from `data-space-theme` and AccentScope. */
export function siteCanvasVars(render: SiteRenderStyle, date = new Date()): CSSProperties {
  if (render.skinned) return websiteThemeVars(render.editorTheme, render.accent, date)
  const base = websiteThemeVars('DAWN', null, date) as Record<string, string>
  const [display, body] = SPACE_THEME_FONT_VARS[render.fonts]
  const def = SPACE_THEMES.find((t) => t.id === render.fonts)
  const tokens: Record<string, string> = {
    ...base,
    '--th-display': `'${def?.displayFont ?? 'Playfair Display'}', ${base['--th-display'] ?? 'serif'}`,
    '--th-body': `'${def?.bodyFont ?? 'Space Grotesk'}', ${base['--th-body'] ?? 'sans-serif'}`,
    '--th-display-render': `var(${display}, ${base['--th-display'] ?? 'serif'})`,
    '--th-body-render': `var(${body}, ${base['--th-body'] ?? 'sans-serif'})`,
  }
  if (render.accentVars) {
    tokens['--th-accent'] = render.accentVars['--color-primary']
    tokens['--th-accent-text'] = render.accentVars['--color-primary-strong']
    tokens['--th-on-accent'] = render.accentVars['--color-text-on-primary']
  }
  return tokens as CSSProperties
}
