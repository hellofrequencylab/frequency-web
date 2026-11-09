// BLD-901 FULL MATRIX, step 1. Draws every role in every declared variant in each theme's real token sheet, one HTML per
// theme with a <section data-cell="role:variant"> per variant. Writes $RENDER_OUT/<theme>.html and $RENDER_OUT/cells.json
// (every declared cell: role, variant, theme, surface, device, how it shows, and its width). Step 2 is scripts/render/builder-matrix-shots.mjs, which visits each width and measures.
// Build the site CSS first: node scripts/render/build-css.mjs $RENDER_OUT/app.css
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/builder-matrix.render.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'

const SCOPE_ID: Record<string, string> = { Menswork: 'menswork', Midnight: 'midnight', Wildheart: 'wildheart', Network: 'network', NetworkKit: 'network-kit', Temple: 'temple', TempleKit: 'temple-kit', Designer: 'designer', FreeHuman: 'free-human', Services: 'services', NewWorld: 'new-world', NewWorldDay: 'new-world' }
const PRESENTATION_THEME: Record<string, string> = { NewWorldDay: 'NewWorld' }

it('renders every role variant in every theme', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { rolesComponents } = await import('@/components/page-editor/blocks/roles')
  const { ROLES, ROLE_IDS } = await import('@/lib/blocks/roles/roles')
  const { roleBlocksCss } = await import('@/components/sites/role-blocks-css')
  const { MATRIX_THEMES, matrixCells } = await import('@/lib/builder/matrix')
  const css: Record<string, string> = {
    Menswork: (await import('@/components/sites/menswork-css')).MENSWORK_CSS, Midnight: (await import('@/components/sites/midnight-css')).MIDNIGHT_CSS,
    Wildheart: (await import('@/components/sites/wildheart-css')).WILDHEART_CSS, Network: (await import('@/components/sites/network-css')).NETWORK_CSS,
    NetworkKit: (await import('@/components/sites/network-kit-css')).NETWORK_KIT_CSS, Temple: (await import('@/components/sites/temple-css')).TEMPLE_CSS,
    TempleKit: (await import('@/components/sites/temple-kit-css')).TEMPLE_KIT_CSS, Designer: (await import('@/components/sites/designer-css')).DESIGNER_CSS,
    FreeHuman: (await import('@/components/sites/free-human-css')).FREE_HUMAN_CSS,
    Services: (await import('@/lib/theme/services')).SERVICES_TOKENS_CSS + (await import('@/components/sites/services-css')).SERVICES_CSS,
    NewWorld: (await import('@/components/sites/new-world-css')).NEW_WORLD_CSS,
    DAWN: readFileSync('app/themes/frequency.css', 'utf8'),
  }
  // The site's own utility CSS (node scripts/render/build-css.mjs $RENDER_OUT/app.css), when built. Only DAWN (the app's own theme) wears it; the other themes bring their own sheet, as in builder-roles-themes.render.tsx.
  const app = existsSync(`${out}/app.css`) ? readFileSync(`${out}/app.css`, 'utf8') : ''
  for (const theme of MATRIX_THEMES) {
    const base = PRESENTATION_THEME[theme] ?? theme
    const body = ROLE_IDS.flatMap((id) => Object.keys(ROLES[id].variants).map((variant) => {
      const props = { ...ROLES[id].sample } as Record<string, unknown>
      delete props.sample
      const render = rolesComponents[ROLES[id].type].render as (p: unknown) => React.ReactElement
      return `<section data-cell="${id}:${variant}">${renderToStaticMarkup(render({ ...props, variant, puck: { metadata: { theme: base } } }))}</section>`
    })).join('\n')
    const attr = theme === 'NewWorldDay' ? ' data-th="day"' : ''
    writeFileSync(`${out}/${theme}.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${theme === 'DAWN' ? app : ''}${css[base]}${roleBlocksCss(base as Parameters<typeof roleBlocksCss>[0])}*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body><div data-house-theme="${SCOPE_ID[theme] ?? ''}"${attr} style="background:var(--c-canvas);color:var(--c-text)">${body}</div></body></html>`)
  }
  writeFileSync(`${out}/cells.json`, JSON.stringify(matrixCells()))
})
