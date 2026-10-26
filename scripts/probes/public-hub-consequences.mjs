import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as jsx from 'react/jsx-runtime'
import ts from 'typescript'
import { loadProbeModule, loadPureProbeExport } from '../lib/probe-module.mjs'

const noop = () => null
const JsonLd = () => null
const site = { SITE_NAME: 'Frequency', SITE_URL: 'https://frequencylocal.com', OG_SITE: { siteName: 'Frequency', locale: 'en_US' }, ROOT_OG_IMAGES: [{ url: 'https://frequencylocal.com/opengraph-image.jpg' }] }
const hub = { city: 'Vista', circles: [], events: [], spaces: [] }
let dense = hub, town = null, spaces = [], cityEvents = [{ region: 'CA', country: 'US' }]
const shared = {
  'react/jsx-runtime': jsx,
  'next/link': { default: noop }, 'next/navigation': { notFound: () => { throw Error('not found') } },
  'lucide-react': { ArrowRight: noop, Users: noop, CalendarDays: noop, Building2: noop, Compass: noop },
  '@/components/spaces/space-card': { SpaceCard: noop },
  '@/components/marketing/marketing-ui': { PageHero: noop, Section: noop, SectionHeading: noop, BetaCTA: noop, Button: noop },
  '@/components/json-ld': { JsonLd }, '@/lib/site': site,
  '@/lib/theme/design': { SITE_DESIGN: 'frequency' },
  '@/lib/jsonld': { breadcrumbSchema: () => ({}), circleListSchema: () => ({}), cityEventListSchema: () => ({}), spaceListSchema: () => ({}) },
}
const city = loadProbeModule('app/discover/cities/[citySlug]/page.tsx', {
  ...shared,
  '../_data': { getDensityCity: async () => dense, listDensityCities: async () => [], cityFromSlug: () => 'Vista' },
  '../_towns': { getCityHub: async () => town },
  '@/lib/seo/index-floor': loadProbeModule('lib/seo/index-floor.ts'),
  '@/app/discover/events/_data': { cityRegion: loadPureProbeExport('app/discover/events/_data.ts', 'cityRegion'), getCityCategoryHubs: async () => [{ citySlug: 'vista', category: { slug: 'movement', label: 'Movement' }, events: cityEvents }] },
  '@/components/discover/cards': { CircleCard: noop, EventRow: noop }, '@/components/ui/stat': { Stat: noop },
  '@/lib/time/zone': { HOME_TZ: 'America/Los_Angeles', dayInZone: () => '2026-10-23' },
  '@/components/frequency/site/pages/discover/frequency-discover-places': { FrequencyTown: noop },
})
const space = loadProbeModule('app/discover/spaces/[type]/page.tsx', {
  ...shared, '@/lib/spaces/discovery': { listNetworkedSpaces: async () => spaces },
  '@/components/spaces/space-type': { DIRECTORY_TYPES: [], spaceTypeLabel: () => 'Business' },
  '@/components/frequency/site/pages/discover/spaces': { FrequencySpaceTypeHub: noop },
})
const cityParams = { params: Promise.resolve({ citySlug: 'vista' }) }
const spaceParams = { params: Promise.resolve({ type: 'business' }) }
const mode = process.argv[2]
assert.ok(['robots', 'address'].includes(mode), 'Specify robots or address')

// The removed places page is deliberately a permanent alias of this live town template.
const config = ts.createSourceFile('next.config.ts', readFileSync('next.config.ts', 'utf8'), ts.ScriptTarget.Latest, true)
let redirect = false
function visit(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const values = new Map(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(config), p.initializer]))
    if (values.get('source')?.getText(config) === "'/discover/places/:citySlug'") {
      assert.equal(values.get('destination')?.getText(config), "'/discover/cities/:citySlug'")
      assert.equal(values.get('permanent')?.kind, ts.SyntaxKind.TrueKeyword)
      redirect = true
    }
  }
  ts.forEachChild(node, visit)
}
visit(config)
assert.ok(redirect, 'Retired place URLs must retain their permanent canonical alias')

if (mode === 'robots') {
  assert.equal(Object.hasOwn(await city.generateMetadata(cityParams), 'robots'), false)
  dense = null; town = hub
  assert.equal((await city.generateMetadata(cityParams)).robots.index, false)
  town = { ...hub, events: [{}, {}, {}] }
  assert.equal(Object.hasOwn(await city.generateMetadata(cityParams), 'robots'), false)
  spaces = [{}, {}]
  assert.equal((await space.generateMetadata(spaceParams)).robots.index, false)
  spaces = [{}, {}, {}]
  assert.equal(Object.hasOwn(await space.generateMetadata(spaceParams), 'robots'), false)
  console.log('Actual city and Space metadata omit robots above the floor and noindex thin hubs')
} else {
  function collection(node) {
    if (Array.isArray(node)) return node.map(collection).find(Boolean)
    if (!node || typeof node !== 'object') return null
    if (node.type === JsonLd) return node.props.data.find(value => value['@type'] === 'CollectionPage')
    return collection(node.props?.children)
  }
  const schema = collection(await city.default(cityParams))
  assert.deepEqual(schema.about.address, { '@type': 'PostalAddress', addressLocality: 'Vista', addressRegion: 'CA', addressCountry: 'US' })
  cityEvents = []
  const unknown = collection(await city.default(cityParams)).about.address
  assert.equal(Object.hasOwn(unknown, 'addressRegion'), false)
  assert.equal(Object.hasOwn(unknown, 'addressCountry'), false)
  console.log('Actual unified city schema qualifies known regions/countries without inventing unknown ones')
}
