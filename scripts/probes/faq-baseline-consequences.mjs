import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { loadProbeModule, loadPureProbeExport } from '../lib/probe-module.mjs'

const faq = loadPureProbeExport('lib/jsonld.ts', 'faqSchema')
const site = { BETA_CTA_LABEL: 'Fixture join', BETA_CTA_HREF: '/join', BETA_CTA_SECONDARY_LABEL: 'Fixture discover', BETA_CTA_SECONDARY_HREF: '/discover', FOUNDING_PLACE: 'Fixture region' }
for (const slug of ['the-lab', 'the-community']) {
  const { data } = loadProbeModule(`lib/page-editor/templates/${slug}.ts`, { '@/lib/site': site })
  const questions = data.content.filter(block => block.type === 'Accordion').flatMap(block => block.props.items ?? [])
  assert.ok(questions.length >= 4, `${slug}: visible questions cannot be an empty Accordion marker`)
  for (const item of questions) assert.ok(typeof item.q === 'string' && item.q.trim() && typeof item.a === 'string' && item.a.trim())
  const schema = faq(questions)
  assert.equal(schema['@type'], 'FAQPage'); assert.equal(schema.mainEntity.length, questions.length)
}
// The baseline gate excludes published documents by design. Derive its expected set from
// registered templates, the actual published census and actual PNG names, never a numeric floor.
const source = ts.createSourceFile('templates.ts', readFileSync('lib/page-editor/templates/index.ts', 'utf8'), ts.ScriptTarget.Latest, true)
let registry
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'TEMPLATES') registry = node.initializer
  ts.forEachChild(node, walk)
}
walk(source)
assert.ok(registry && ts.isObjectLiteralExpression(registry))
const registered = new Set(registry.properties.map(p => ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(source)))
const published = new Set(loadPureProbeExport('test/e2e/template-fingerprints.test.ts', 'publishedSlugsIn')(JSON.parse(readFileSync('scripts/stored-links.json', 'utf8'))))
const pngs = readdirSync('test/e2e/__screenshots__/visual.spec.ts').filter(file => file.endsWith('.png'))
const expected = [...new Set(pngs.map(file => file.split('--')[0]).filter(slug => registered.has(slug) && !published.has(slug)))].sort()
assert.ok(expected.includes('the-lab') && expected.includes('the-community'))
const evidence = JSON.parse(readFileSync('test/e2e/template-fingerprints.json', 'utf8'))
assert.deepEqual(Object.keys(evidence.surfaces).sort(), expected, 'All actual template baseline sets must be represented')
for (const [slug, entry] of Object.entries(evidence.surfaces)) {
  assert.match(entry.fingerprint, /^[a-f0-9]{16}$/)
  assert.match(entry.capturedIn, /^[a-f0-9]{7,40}$/, `${slug}: local or absent capture stamps are not runner evidence`)
  assert.equal(['3b86a7411', '11d1ccb16', 'd49590a19'].includes(entry.capturedIn), false, `${slug}: pre-change capture`)
}
const capture = JSON.parse(readFileSync('test/e2e/__screenshots__/captured-on.json', 'utf8'))
assert.equal(capture.environment, 'preview')
assert.equal(new URL(capture.baseUrl).hostname.endsWith('.vercel.app'), true)
console.log(`Actual template FAQ data and schema agree; all ${expected.length} unshadowed baseline sets carry runner-shaped stamps and preview origin. Fingerprint content and real visual acceptance remain separately verified.`)
