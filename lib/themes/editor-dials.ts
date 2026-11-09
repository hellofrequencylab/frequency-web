import SCHEMA2 from './editor-schema2.json' with { type: 'json' }
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { dialsFor, declaredDefault, looksFor, type Dial, type LookPreset, type ThemeEditorDecl } from '@/lib/theme/dials'
import { SITE_DIAL_KEYS, type SiteDialKey } from '@/lib/theme/dials'
import type { SiteThemeId } from '@/lib/theme/site-style'
import CONTRACT from '@/lib/sites/editor/theme-contract.json' with { type: 'json' }
import type { AccentChoice } from '@/components/sites/editor/theme-controls'
import type { WebsiteTheme } from '@/lib/sites/editor/state'

// THE EDITOR'S VIEW OF A THEME (LIVE-1997, manifest schema 2). editor-schema2.json holds, per theme id, the `editor`
// keys a schema 2 manifest adds (dials, themeDials, looks, resolver); lib/themes/manifests.test.ts merges it into the
// generated manifest, so the manifest and this loader never disagree. A theme with no entry is a schema 1 theme: it
// shows the four dials it always had and nothing else, so its editor is unchanged until its entry lands.

const DECLS = SCHEMA2 as unknown as Record<string, ThemeEditorDecl>

export interface ThemeEditor {
  dials: Dial[]
  looks: LookPreset[]
  /** The theme's declared default for each new enumerated dial it sets; the fallback applies to the rest. */
  own: Partial<Record<SiteDialKey, string>>
}

/** What the editor shows for a site theme id (`midnight`, `network-kit`, ...). */
export function themeEditor(site: SiteThemeId, themeName = ''): ThemeEditor {
  const manifestId = MEGA_THEMES.find((m) => m.site === site)?.id ?? site
  const decl = DECLS[manifestId] ?? null
  const dials = dialsFor(decl, themeName)
  const own: Partial<Record<SiteDialKey, string>> = {}
  for (const k of SITE_DIAL_KEYS) {
    const d = declaredDefault(decl, k)
    if (d) own[k] = d
  }
  return { dials, looks: looksFor(decl, dials), own }
}

/** The named accents a theme's contract declares (`accents{}`), as swatches. Empty for a theme that has none. */
export function themeAccents(editorTheme: WebsiteTheme): AccentChoice[] {
  const themes = (CONTRACT as unknown as { themes: Record<string, { accents?: Record<string, { label?: string; accent?: string }> }> }).themes
  return Object.entries(themes[editorTheme]?.accents ?? {}).flatMap(([id, a]) => (typeof a?.accent === 'string' ? [{ id, label: a.label ?? id, swatch: a.accent }] : []))
}
