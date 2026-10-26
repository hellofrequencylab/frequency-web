import assert from 'node:assert/strict'
import * as jsx from 'react/jsx-runtime'
import { loadProbeModule } from '../lib/probe-module.mjs'

const noop = () => null
const ROOT_OG_IMAGES = [{ url: 'https://frequencylocal.com/opengraph-image.jpg' }]
const helper = loadProbeModule('lib/help/metadata.ts', { '@/lib/site': { ROOT_OG_IMAGES } })
const dependencies = {
  'react/jsx-runtime': jsx,
  '@/lib/help/metadata': helper, '@/lib/site': { SITE_NAME: 'Frequency' },
  'next/link': { default: noop }, 'next/navigation': { notFound: () => { throw Error('not found') } },
  'lucide-react': { LifeBuoy: noop },
  '@/lib/help/content': { getAllCategories: async () => [{ slug: 'getting-started', title: 'Getting started', description: 'How to begin.' }], helpHref: () => '/help' },
  '@/lib/theme/design': { SITE_DESIGN: 'frequency' },
  '@/components/ui/empty-state': { EmptyState: noop },
  '@/components/templates': { IndexTemplate: noop, StreamTemplate: noop },
  '@/lib/layout/index-hero': { resolveIndexHero: async () => ({}) },
  '@/components/json-ld': { JsonLd: noop }, '@/lib/jsonld': { breadcrumbSchema: noop },
  '@/components/frequency/site/pages/help/frequency-help': { FrequencyHelp: noop },
  '@/components/frequency/site/pages/help/frequency-help-pages': { FrequencyHelpChangelog: noop, FrequencyHelpCategory: noop },
  '@/components/help/help-markdown': { HelpMarkdown: noop },
  fs: { promises: { readFile: () => { throw Error('Metadata must not read changelog content') } } },
  path: { default: {} },
}
const parent = {
  openGraph: { images: [{ url: new URL('https://frequencylocal.com/opengraph-image-help?build=fixture') }] },
  twitter: { title: 'Generic home copy', images: [{ url: new URL('https://frequencylocal.com/twitter-image-help?build=fixture') }] },
}
for (const [file, canonical] of [
  ['app/(help)/help/page.tsx', '/help'],
  ['app/(help)/help/changelog/page.tsx', '/help/changelog'],
  ['app/(help)/help/[category]/page.tsx', '/help/getting-started'],
]) {
  const route = loadProbeModule(file, dependencies)
  assert.equal(typeof route.generateMetadata, 'function', `${file}: parent metadata must be resolved`)
  const metadata = await route.generateMetadata({ params: Promise.resolve({ category: 'getting-started' }) }, Promise.resolve(parent))
  assert.deepEqual(metadata.openGraph.images, parent.openGraph.images, file)
  assert.deepEqual(metadata.twitter.images, parent.twitter.images, file)
  assert.deepEqual(metadata.twitter.title, metadata.openGraph.title, file)
  assert.deepEqual(metadata.twitter.description, metadata.openGraph.description, file)
  assert.equal(metadata.alternates.canonical, canonical, file)
}
const category = loadProbeModule('app/(help)/help/[category]/page.tsx', dependencies)
assert.deepEqual(await category.generateMetadata({ params: Promise.resolve({ category: 'missing' }) }, Promise.resolve(parent)), {})
console.log('Three actual Help metadata exports keep inherited file cards, page copy and canonical URLs')
