// FIXTURE RENDER: every builder role drawn in each theme's default layout with that
// theme's real token sheet. Writes $RENDER_OUT/<theme>.html. Check with scripts/render/builder-roles-themes-shots.mjs.
// RENDER_VARIANTS=gatherings=agenda forces a layout (to check one before a theme picks it).
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/builder-roles-themes.render.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'

const THEMES = ['DAWN', 'Menswork', 'Midnight', 'Wildheart', 'Network', 'NetworkKit', 'Temple', 'TempleKit', 'Designer', 'FreeHuman', 'Services', 'NewWorld'] as const
const SCOPE_ID: Record<string, string> = { Menswork: 'menswork', Midnight: 'midnight', Wildheart: 'wildheart', Network: 'network', NetworkKit: 'network-kit', Temple: 'temple', TempleKit: 'temple-kit', Designer: 'designer', FreeHuman: 'free-human', Services: 'services', NewWorld: 'new-world' }

const SERVICES_FONTS = [
  ['bricolage-grotesque/bricolage-grotesque.woff2', 'Bricolage Grotesque', '200 800', 'normal'],
  ['lora/lora.woff2', 'Lora', '400 700', 'normal'],
  ['lora/lora-italic.woff2', 'Lora', '400 700', 'italic'],
] as const

function servicesFonts(out: string): string {
  return SERVICES_FONTS.map(([path, family, weight, style]) => {
    const file = path.split('/').at(-1)!
    copyFileSync(`app/fonts/${path}`, `${out}/${file}`)
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url('./${file}') format('woff2')}`
  }).join('')
}

it('renders the builder roles in every theme', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { rolesComponents } = await import('@/components/page-editor/blocks/roles')
  const { ROLES, ROLE_IDS } = await import('@/lib/blocks/roles/roles')
  const { roleBlocksCss } = await import('@/components/sites/role-blocks-css')
  const { presentationDefault } = await import('@/components/sites/presentation')
  const { SERVICES_SITE_CSS } = await import('@/components/sites/services-css')
  const { servicesAccentVars, SERVICES_ACCENTS } = await import('@/lib/theme/services')
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
    if (theme !== 'Services') continue

    const { servicesBlocks } = await import('@/components/page-editor/blocks/services')
    const { SpaceOfferingsBlock } = await import('@/components/page-editor/blocks/profile')
    const { ServicesKitSpotlightLayout } = await import('@/components/spotlight/services-kit-layouts')
    const { servicesKitSpotlightContent } = await import('@/lib/spotlight/services-kit-content')
    const { servicesKitEmail } = await import('@/lib/theme/services-kit-email')
    const { formatServiceDuration, formatServicePrice } = await import('@/lib/spaces/profile-data')
    const renderHero = servicesBlocks.ServicesHero.render as (props: unknown) => React.ReactElement
    const service = { title: 'Fixture window cleaning', price: 85, durationMinutes: 45, visibility: 'listed' as const }
    const offer = { name: service.title, price: formatServicePrice(service)!, dur: formatServiceDuration(service.durationMinutes)!, icon: 'tag' as const }
    const hero = renderToStaticMarkup(renderHero({ ...servicesBlocks.ServicesHero.defaultProps, look: 'glow', image: '', offers: [{ ...offer, meta: offer.dur }], puck: { metadata: { theme } } }))
    const photoEmpty = renderToStaticMarkup(renderHero({ ...servicesBlocks.ServicesHero.defaultProps, look: 'split', image: '', areas: [], puck: { metadata: { theme } } }))
    const gatherings = ROLES.gatherings
    const renderGatherings = rolesComponents[gatherings.type].render as (props: unknown) => React.ReactElement
    const empty = renderToStaticMarkup(renderGatherings({ ...gatherings.sample, sample: false, items: [], image: '', empty: 'No dates are scheduled.', puck: { metadata: { theme, space: { spaceId: 'services-fixture', events: [] } } } }))
    const profile = renderToStaticMarkup(<SpaceOfferingsBlock items={[service]} />)
    const privateProfile = renderToStaticMarkup(<SpaceOfferingsBlock items={[{ ...service, visibility: 'private' }]} />)
    const spotlight = renderToStaticMarkup(<ServicesKitSpotlightLayout layout="services-kit:shop-front" content={{ ...servicesKitSpotlightContent('general', { sample: false }), offers: [offer] }} />)
    const accent = Object.entries(servicesAccentVars(null)).map(([name, value]) => `${name}:${value}`).join(';')
    writeFileSync(`${out}/ServicesPreview.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${servicesFonts(out)}${SERVICES_SITE_CSS}${roleBlocksCss(theme)}*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body><div style="${accent}"><div class="hs-root" data-house-site data-house-theme="services" data-conformance-preview data-type="caps" data-motion="full" data-image="glow"><div data-preview-hero>${hero}</div><main>${body}</main><div data-preview-empty>${empty}${photoEmpty}</div></div></div><section data-preview-profile>${profile && `<div data-fn="services">${profile}</div>`}</section><section data-preview-private>${privateProfile && `<div data-fn="services">${privateProfile}</div>`}</section><section data-preview-spotlight>${spotlight}</section></body></html>`)
    const email = servicesKitEmail('receipt', {
      name: 'Services fixture', owner: 'Fixture owner', accent: { fill: SERVICES_ACCENTS.tide.accent, text: SERVICES_ACCENTS.tide.text },
      siteUrl: 'https://example.test', siteLabel: 'Services fixture', unsubscribeUrl: 'https://example.test/unsubscribe',
    }, { service: { name: offer.name, meta: offer.dur, price: offer.price } })
    writeFileSync(`${out}/ServicesPreviewEmail.html`, email.html)
  }
})
