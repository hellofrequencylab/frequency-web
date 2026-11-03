// FIXTURE RENDER: every builder role drawn in each theme's default layout with that
// theme's real token sheet. Writes $RENDER_OUT/<theme>.html. Check with scripts/render/builder-roles-themes-shots.mjs.
// RENDER_VARIANTS=gatherings=agenda forces a layout (to check one before a theme picks it).
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/builder-roles-themes.render.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'

const THEMES = ['DAWN', 'Menswork', 'Midnight', 'Wildheart', 'Network', 'NetworkKit', 'Temple', 'TempleKit', 'Designer', 'FreeHuman', 'Services', 'NewWorld'] as const
const SCOPE_ID: Record<string, string> = { Menswork: 'menswork', Midnight: 'midnight', Wildheart: 'wildheart', Network: 'network', NetworkKit: 'network-kit', Temple: 'temple', TempleKit: 'temple-kit', Designer: 'designer', FreeHuman: 'free-human', Services: 'services', NewWorld: 'new-world' }

it('renders the builder roles in every theme', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { rolesComponents } = await import('@/components/page-editor/blocks/roles')
  const { ROLES, ROLE_IDS } = await import('@/lib/blocks/roles/roles')
  const { roleBlocksCss } = await import('@/components/sites/role-blocks-css')
  const { presentationDefault } = await import('@/components/sites/presentation')
  const css = {
    Menswork: (await import('@/components/sites/menswork-css')).MENSWORK_CSS, Midnight: (await import('@/components/sites/midnight-css')).MIDNIGHT_CSS,
    Wildheart: (await import('@/components/sites/wildheart-css')).WILDHEART_CSS, Network: (await import('@/components/sites/network-css')).NETWORK_CSS,
    NetworkKit: (await import('@/components/sites/network-kit-css')).NETWORK_KIT_CSS, Temple: (await import('@/components/sites/temple-css')).TEMPLE_CSS,
    TempleKit: (await import('@/components/sites/temple-kit-css')).TEMPLE_KIT_CSS, Designer: (await import('@/components/sites/designer-css')).DESIGNER_CSS,
    FreeHuman: (await import('@/components/sites/free-human-css')).FREE_HUMAN_CSS,
    Services: (await import('@/lib/theme/services')).SERVICES_TOKENS_CSS + (await import('@/components/sites/services-css')).SERVICES_CSS,
    NewWorld: (await import('@/components/sites/new-world-css')).NEW_WORLD_CSS,
    DAWN: readFileSync('app/themes/frequency.css', 'utf8'),
  } as Record<string, string>
  for (const theme of THEMES) {
    const body = ROLE_IDS.map((id) => {
      const base = { ...ROLES[id].sample } as Record<string, unknown>
      delete base.sample
      const forced = Object.fromEntries((process.env.RENDER_VARIANTS ?? '').split(',').filter(Boolean).map((x) => x.split('=')))
      const variant = forced[id] ?? presentationDefault(theme, id) ?? ROLES[id].default
      const render = rolesComponents[ROLES[id].type].render as (p: unknown) => React.ReactElement
      return renderToStaticMarkup(render({ ...base, variant, puck: { metadata: { theme } } }))
    }).join('\n')
    const files = theme === 'NewWorld' ? [['NewWorld', ''], ['NewWorldDay', ' data-th="day"']] : [[theme, '']]
    for (const [name, attr] of files) writeFileSync(`${out}/${name}.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css[theme]}${roleBlocksCss(theme)}*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body><div data-house-theme="${SCOPE_ID[theme] ?? ''}"${attr} style="background:var(--c-canvas);color:var(--c-text)">${body}</div></body></html>`)
  }
})
