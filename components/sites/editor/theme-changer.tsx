'use client'

import { KitLibrary } from './kit-library'
import { prefetchTheme } from '../theme-preview-swap'
import { k } from './skin'
import { foreignBlocksFor } from '@/lib/sites/skin-family'
import { SITE_THEMES, type SiteThemeId } from '@/lib/theme/site-style'
import { websiteThemeVars } from '@/lib/sites/editor/theme'
import { WEBSITE_THEMES_LIVE, type WebsiteTheme } from '@/lib/sites/editor/state'
import type { KitChanges } from '@/lib/sites/kits/apply'
import type { KitApplyMode, KitNiche } from '@/lib/sites/kits/types'

type SiteThemeDef = (typeof SITE_THEMES)[number]

/** The Change theme dialog (ADR-1881 piece: the editor's switcher). Every theme as a card, then the starter
 *  kits for the theme the draft now wears. It calls the same handlers as the Theme tab, so a pick is one undo
 *  step and nothing reaches the live site until the owner publishes. */
export function ThemeChanger({ current, pages, labels, editorTheme, onPick, onTry, onApplyKit, onPreviewKit, suggestedNiche }: {
  current: WebsiteTheme
  /** The draft's page documents, read for blocks drawn for another theme. */
  pages: unknown
  labels: Record<WebsiteTheme, string>
  editorTheme: (id: SiteThemeId) => WebsiteTheme
  onPick: (theme: SiteThemeDef) => void
  /** Try it on: wear this theme over the Space's own pages, saved nowhere. Warmed when the pointer reaches the card. */
  onTry?: (id: SiteThemeId) => void
  onApplyKit: (id: string, mode: KitApplyMode) => Promise<string>
  onPreviewKit?: (id: string) => Promise<KitChanges | string>
  suggestedNiche?: KitNiche | null
}) {
  return <>
    <p className={k('we-note')}>Pick a look for your whole website. Your words and photos stay. Blocks keep their shape and take on the new colors and type, and undo takes the change back.</p>
    {SITE_THEMES.map((t) => {
      const theme = editorTheme(t.id)
      const on = current === theme
      const foreign = foreignBlocksFor(pages, t.id).reduce((n, f) => n + f.count, 0)
      return <div key={t.id} onPointerEnter={onTry ? prefetchTheme : undefined} onFocus={onTry ? prefetchTheme : undefined}>
        <button type="button" className={k('we-theme-card')} aria-pressed={on} onClick={() => onPick(t)}>
          <span className={k('we-theme-swatch')} style={websiteThemeVars(theme)} aria-hidden><i data-swatch="bg" /><i data-swatch="accent" /></span>
          <span><b>{labels[theme]}{on && <em> · Current</em>}</b><small>{t.description}{!WEBSITE_THEMES_LIVE.has(theme) && ' Still in preview: your live site keeps its look until this theme is ready.'}{foreign > 0 && ` ${foreign === 1 ? '1 block was' : `${foreign} blocks were`} drawn for another theme. ${foreign === 1 ? 'It keeps' : 'They keep'} its shape and wear this theme's colors and type.`}</small></span>
        </button>
        {onTry && !on && <button type="button" className={k('we-try-btn')} onClick={() => onTry(t.id)}>Try it on</button>}
      </div>
    })}
    <KitLibrary theme={current} onApply={onApplyKit} onPreview={onPreviewKit} suggestedNiche={suggestedNiche} />
  </>
}
