import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as jsx from 'react/jsx-runtime'
import ts from 'typescript'
import { loadProbeModule, loadPureProbeExport } from '../lib/probe-module.mjs'

const mode = process.argv[2]
assert.ok(['freshness', 'schema', 'images'].includes(mode), 'Specify freshness, schema or images')
const noop = () => null
const JsonLd = () => null
const site = { SITE_NAME: 'Frequency', SITE_URL: 'https://frequencylocal.com', SITE_OG_IMAGE: 'https://frequencylocal.com/opengraph-image.jpg', SITE_TAGLINE: 'Community Collective', SITE_DESCRIPTION: 'Local groups and events.', FOUNDING_CITIES: [], OG_SITE: { siteName: 'Frequency', locale: 'en_US' }, ROOT_OG_IMAGES: [{ url: 'https://frequencylocal.com/opengraph-image.jpg' }] }
const schemas = loadProbeModule('lib/jsonld.ts', { '@/lib/site': site, '@/lib/time/zone': { eventIsoWithOffset: () => { throw Error('Editorial metadata must not resolve event dates') } } })
const richtext = loadProbeModule('lib/page-editor/richtext.tsx', { 'react/jsx-runtime': jsx, 'next/link': { default: noop } })
const { BlockDocJsonLd } = loadProbeModule('lib/page-editor/block-seo.tsx', {
  'react/jsx-runtime': jsx, '@/components/json-ld': { JsonLd }, '@/lib/jsonld': schemas,
  '@/lib/library/asset-ref': loadProbeModule('lib/library/asset-ref.ts'), '@/lib/page-editor/richtext': richtext,
})
const frequency = loadProbeModule('lib/seo/frequency-pages.ts', { '@/lib/site': site, '@/lib/jsonld': schemas })
const document = { content: [{ type: 'Hero', props: { title: 'Document hero must not become the canonical headline', body: 'A synthetic published document.' } }], root: { props: {} } }
let publishedAt = '2099-12-31T10:00:00Z'
const dependencies = {
  'react/jsx-runtime': jsx, '@/lib/site': site,
  '@/lib/page-editor/block-render': { BlockRender: noop }, '@/lib/page-editor/block-seo': { BlockDocJsonLd },
  '@/lib/page-editor/config': { config: {} }, '@/components/json-ld': { JsonLd }, '@/lib/jsonld': schemas,
  '@/lib/page-editor/data': { getPublishedPage: async () => ({ doc: document, published_at: publishedAt }), latestDay: loadPureProbeExport('lib/page-editor/data.ts', 'latestDay') },
  '@/lib/page-editor/templates': { getTemplate: () => document, isWellFormed: value => Boolean(value?.content) },
  '@/lib/supabase/admin': { createAdminClient: () => ({}) }, '@/lib/page-editor/live-data': { getLiveData: async () => null },
}
function findNode(node, type) {
  if (Array.isArray(node)) { for (const child of node) { const found = findNode(child, type); if (found) return found } return null }
  if (!node || typeof node !== 'object') return null
  return node.type === type ? node : findNode(node.props?.children, type)
}
function source(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) }
function visit(node, action) { action(node); ts.forEachChild(node, child => visit(child, action)) }
function assertAlias(from, to) {
  const config = ts.createSourceFile('next.config.ts', readFileSync('next.config.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  let found = false
  visit(config, node => {
    if (!ts.isObjectLiteralExpression(node)) return
    const values = new Map(node.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(config), property.initializer]))
    if (values.get('source')?.text === from && values.get('destination')?.text === to && values.get('permanent')?.kind === ts.SyntaxKind.TrueKeyword) found = true
  })
  assert.ok(found, `${from}: preserve the permanent canonical alias to ${to}`)
}

if (mode === 'freshness') {
  for (const slug of ['how-to-start-a-circle', 'how-to-build-community', 'loneliness', 'calm-down-fast', 'friendship-as-an-adult', 'how-to-be-more-social']) {
    const route = loadProbeModule(`app/(marketing)/${slug}/page.tsx`, dependencies)
    publishedAt = '2099-12-31T10:00:00Z'
    const block = findNode(await route.default(), BlockDocJsonLd)
    assert.ok(block, `${slug}: published guide must still carry structured data`)
    const schema = BlockDocJsonLd(block.props).props.data
    assert.equal(schema.dateModified, '2099-12-31', `${slug}: a fresh publish must beat the coded date`)
    assert.match(schema.datePublished, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(schema.headline, block.props.title)
    assert.notEqual(schema.headline, document.content[0].props.title)
    publishedAt = null
    const fallback = findNode(await route.default(), BlockDocJsonLd)
    assert.notEqual(BlockDocJsonLd(fallback.props).props.data.dateModified, '2099-12-31')
  }
  const comparisons = loadProbeModule('lib/marketing/comparisons.ts', { '@/lib/pricing/plan-story': loadProbeModule('lib/pricing/plan-story.ts') })
  const comparison = comparisons.COMPARISONS[0]
  comparison.updated = '2099-12-31'
  const compareRoute = loadProbeModule('app/(marketing)/vs/[slug]/page.tsx', {
    'react/jsx-runtime': jsx, 'next/link': { default: noop }, 'next/navigation': { notFound: () => { throw Error('not found') } },
    'lucide-react': { ArrowRight: noop, Check: noop },
    '@/components/marketing/marketing-ui': { PhotoHero: noop, Section: noop, Lead: noop, Body: noop, PullQuote: noop, FaqList: noop, BetaCTA: noop, Button: noop },
    '@/components/json-ld': { JsonLd }, '@/lib/jsonld': schemas, '@/lib/site': site,
    '@/lib/marketing/comparisons': comparisons, '@/lib/theme/design': { SITE_DESIGN: 'frequency' },
    '@/components/frequency/site/pages/funnel/frequency-compare': { FrequencyCompare: noop },
  })
  const compareSchema = findNode(await compareRoute.default({ params: Promise.resolve({ slug: comparison.slug }) }), JsonLd).props.data.find(value => value['@type'] === 'Article')
  assert.equal(compareSchema.dateModified, '2099-12-31')
  assert.equal(compareSchema.datePublished, comparison.published)
  // Two old guide URLs are now intentional aliases, not missing published documents.
  const legal = loadProbeModule('lib/nav/legal-links.ts')
  const nav = loadProbeModule('lib/frequency/site-nav.ts', { '@/lib/nav/legal-links': legal })
  let redirected
  const navigation = { permanentRedirect: value => { redirected = value } }
  loadProbeModule('app/(marketing)/what-is-frequency/page.tsx', { 'next/navigation': navigation, '@/lib/frequency/site-nav': nav }).default()
  assert.equal(redirected, '/about')
  const guide = loadProbeModule('lib/page-editor/templates/how-to-build-community.ts', { '@/lib/page-editor/templates/article': { articleTemplate: value => value }, '@/lib/pricing/plan-story': loadProbeModule('lib/pricing/plan-story.ts') })
  loadProbeModule('app/(marketing)/tools-for-community-builders/page.tsx', { 'next/navigation': navigation, '@/lib/page-editor/templates/how-to-build-community': guide }).default()
  assert.equal(redirected, '/how-to-build-community')
  assertAlias('/the-quest', '/features#f-zaps')
  console.log('Six actual guide renders and the comparison registry advance dateModified without invented dates; retired guide aliases remain wired')
} else if (mode === 'schema') {
  const about = loadProbeModule('app/(marketing)/about/page.tsx', dependencies)
  const block = findNode(await about.default(), BlockDocJsonLd)
  const schema = BlockDocJsonLd(block.props).props.data
  assert.equal(schema['@type'], 'AboutPage')
  assert.equal(schema.headline, about.generateMetadata().title, 'About structured data must use the current canonical page title')
  assert.notEqual(schema.headline, document.content[0].props.title, 'Published hero copy must not replace the canonical page headline')
  assert.equal(schema.dateModified, '2099-12-31')
  assert.match(schema.datePublished, /^\d{4}-\d{2}-\d{2}$/)
  assertAlias('/the-lab', '/vision')
  for (const seo of Object.values(frequency.FREQUENCY_PAGE_SEO)) {
    const nodes = frequency.frequencyPageJsonLd(seo)
    const page = nodes.find(value => value['@type'] === 'WebPage')
    assert.ok(page)
    assert.equal(page.headline, seo.headline)
    assert.equal(nodes.some(value => value['@type'] === 'Article'), false)
  }
  for (const file of ['app/page.tsx', 'app/(marketing)/about/page.tsx', 'app/(marketing)/spaces/page.tsx', 'app/(marketing)/pricing/page.tsx']) {
    const ast = source(file); let count = 0
    visit(ast, node => {
      if (!(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) || node.tagName.getText(ast) !== 'BlockDocJsonLd') return
      count++
      const names = new Set(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => attribute.name.getText(ast)))
      for (const name of file === 'app/page.tsx' ? ['schemaType'] : ['published', 'updated', 'title']) assert.ok(names.has(name), `${file}: missing explicit ${name}`)
      if (file === 'app/page.tsx') {
        const type = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'schemaType')
        assert.equal(type.initializer?.text, 'WebPage', 'The home document must not identify itself as an Article')
      }
    })
    assert.ok(count, `${file}: keep verifying the block-document branch`)
  }
  console.log('Actual About and Frequency page schemas avoid hero-derived undated Articles; block-document dates/titles remain explicit')
} else {
  for (const seo of Object.values(frequency.FREQUENCY_PAGE_SEO)) assert.ok(frequency.frequencyPageMetadata(seo).openGraph.images.length)
  const about = loadProbeModule('app/(marketing)/about/page.tsx', dependencies)
  assert.ok(about.generateMetadata().openGraph.images.length)
  for (const file of ['app/discover/page.tsx', 'app/(marketing)/pricing/page.tsx']) {
    const ast = source(file); let count = 0
    visit(ast, node => {
      if (!ts.isPropertyAssignment(node) || node.name.getText(ast) !== 'openGraph' || !ts.isObjectLiteralExpression(node.initializer)) return
      count++
      assert.ok(node.initializer.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === 'images'), `${file}: own openGraph block must retain images`)
    })
    assert.ok(count)
  }
  // ROOT_OG_IMAGES points at a real static JPEG, not the extensionless catch-all HTML route.
  assert.match(readFileSync('lib/site.ts', 'utf8'), /SITE_OG_IMAGE\s*=\s*`\$\{SITE_URL\}\/opengraph-image\.jpg`/)
  assert.equal(readFileSync('app/opengraph-image.jpg').subarray(0, 2).toString('hex'), 'ffd8')
  assertAlias('/start', '/join')
  console.log('Current page metadata retains real share images; the retired start URL remains a permanent join alias')
}
