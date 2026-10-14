import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSitePageStyle, readSiteStyle, sitePageStyle } from '@/lib/theme/site-style'
import { SPACE_THEMES, SPACE_THEME_FONT_VARS } from '@/lib/theme/space-themes'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { websiteThemeVars } from '@/lib/sites/editor/theme'
import { siteCanvasVars, siteRenderStyle } from './site-render-style'

// The website editor's canvas and the live site resolve a page's look through ONE resolver, so the preview is
// the published page. The regression (danieltyack.com, 2026-10-13): a Frequency site on the Bold font set with
// a teal brand accent previewed in the DAWN contract's Anton and amber while the live page was condensed and teal.

const root = process.cwd()
const ACCENT = '#1EB6C5'
const PREFS = {
  theme: 'menswork',
  siteStyle: { theme: 'frequency', synced: true, spaceFonts: 'classic', pages: { about: 'bold' } },
}

/** The live renderer's inputs (components/sites/site-page.tsx). */
const live = (slug: string) => siteRenderStyle(readSitePageStyle(PREFS, slug), ACCENT, defaultAccentForType('business'))
/** The editor's inputs (components/sites/editor/shell.tsx): its live style with the draft's theme. */
const editor = (slug: string) => siteRenderStyle(sitePageStyle({ ...readSiteStyle(PREFS), theme: 'frequency' }, slug), ACCENT, defaultAccentForType('business'))

/** The `--font-display` / `--font-body` a `[data-space-theme="<id>"]` block binds in app/globals.css. */
function cssFontVars(id: string): [string, string] {
  const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
  const block = css.match(new RegExp(`\\[data-space-theme="${id}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  const pick = (prop: string) => block.match(new RegExp(`${prop}:\\s*var\\((--font-[a-z0-9-]+)\\)`))?.[1] ?? ''
  return [pick('--font-display'), pick('--font-body')]
}

describe('site render style: editor preview === live page', () => {
  it('a Frequency site on the Bold font set previews in its condensed faces and its brand accent', () => {
    const page = live('home')
    expect(editor('home')).toEqual(page)
    expect(page.editorTheme).toBe('DAWN')
    expect(page.fonts).toBe('menswork')
    const vars = siteCanvasVars(editor('home')) as Record<string, string>
    const [display, body] = cssFontVars(page.fonts)
    expect(vars['--th-display-render']).toMatch(new RegExp(`^var\\(${display},`))
    expect(vars['--th-body-render']).toMatch(new RegExp(`^var\\(${body},`))
    expect(vars['--th-display-render']).not.toMatch(/--font-anton/)
    expect(vars['--th-accent']).toBe(page.accentVars?.['--color-primary'])
    expect(vars['--th-accent']).toBe(ACCENT)
    expect(vars['--th-accent-text']).toBe(page.accentVars?.['--color-primary-strong'])
    expect(vars['--th-on-accent']).toBe(page.accentVars?.['--color-text-on-primary'])
  })

  it('with no brand accent the preview paints the Space type default, as the live page does', () => {
    const style = readSitePageStyle(PREFS, 'home')
    const page = siteRenderStyle(style, null, defaultAccentForType('business'))
    expect((siteCanvasVars(page) as Record<string, string>)['--th-accent']).toBe(page.accentVars?.['--color-primary'])
  })

  it('a page on its own theme wears that theme in both, with its skin tokens', () => {
    const page = live('about')
    expect(editor('about')).toEqual(page)
    expect(page.editorTheme).toBe('Menswork')
    expect(page.fonts).toBe('menswork')
    const date = new Date('2026-10-13T12:00:00Z')
    expect(siteCanvasVars(page, date)).toEqual(websiteThemeVars('Menswork', ACCENT, date))
  })

  it('every font set binds the same faces as its globals.css block', () => {
    for (const t of SPACE_THEMES) expect(SPACE_THEME_FONT_VARS[t.id], t.id).toEqual(cssFontVars(t.id))
  })

  it('both the live page and the editor resolve through siteRenderStyle', () => {
    for (const file of ['components/sites/site-page.tsx', 'components/sites/editor/shell.tsx']) {
      expect(readFileSync(join(root, file), 'utf8'), file).toMatch(/siteRenderStyle\(/)
    }
    expect(readFileSync(join(root, 'components/sites/editor/shell.tsx'), 'utf8')).toMatch(/themeVars=\{canvasVars\}/)
  })
})
