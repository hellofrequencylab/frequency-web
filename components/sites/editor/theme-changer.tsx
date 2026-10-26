'use client'

import { KitLibrary } from './kit-library'
import { k } from './skin'
import { SITE_THEMES, type SiteThemeId } from '@/lib/theme/site-style'
import { websiteThemeVars } from '@/lib/sites/editor/theme'
import { WEBSITE_THEMES_LIVE, type WebsiteTheme } from '@/lib/sites/editor/state'
import type { KitChanges } from '@/lib/sites/kits/apply'
import type { KitApplyMode, KitNiche } from '@/lib/sites/kits/types'

type SiteThemeDef = (typeof SITE_THEMES)[number]

/** The Change theme dialog (ADR-1881 piece: the editor's switcher). Every theme as a card, then the starter
 *  kits for the theme the draft now wears. It calls the same handlers as the Theme tab, so a pick is one undo
 *  step and nothing reaches the live site until the owner publishes. */
export function ThemeChanger({ current, labels, editorTheme, onPick, onApplyKit, onPreviewKit, suggestedNiche }: {
  current: WebsiteTheme
  labels: Record<WebsiteTheme, string>
  editorTheme: (id: SiteThemeId) => WebsiteTheme
  onPick: (theme: SiteThemeDef) => void
  onApplyKit: (id: string, mode: KitApplyMode) => Promise<string>
  onPreviewKit?: (id: string) => Promise<KitChanges | string>
  suggestedNiche?: KitNiche | null
}) {
  return <>
    <p className={k('we-note')}>Pick a look for your whole website. Your words, photos and live blocks stay as they are, and undo takes the change back.</p>
    {SITE_THEMES.map((t) => {
      const theme = editorTheme(t.id)
      const on = current === theme
      return <button type="button" key={t.id} className={k('we-theme-card')} aria-pressed={on} onClick={() => onPick(t)}>
        <span className={k('we-theme-swatch')} style={websiteThemeVars(theme)} aria-hidden><i data-swatch="bg" /><i data-swatch="accent" /></span>
        <span><b>{labels[theme]}{on && <em> · Current</em>}</b><small>{t.description}{!WEBSITE_THEMES_LIVE.has(theme) && ' Still in preview: your live site keeps its look until this theme is ready.'}</small></span>
      </button>
    })}
    <KitLibrary theme={current} onApply={onApplyKit} onPreview={onPreviewKit} suggestedNiche={suggestedNiche} />
  </>
}
