import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
import ts from 'typescript'

// Bounded source/callback consequences, not browser or rendered-pixel proof.
// Standalone actual React tests and the deployment browser matrix remain required.
const require = createRequire(import.meta.url)
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss')
export const paths = {
  pricing: 'components/frequency/site/pages/pricing/pricing-calculator.tsx',
  heading: 'components/page-editor/blocks/kit.tsx',
  niche: 'components/frequency/site/pages/funnel/niche/niche-door.tsx',
  blocksCss: 'app/themes/frequency/site-blocks.css',
  nicheCss: 'app/themes/frequency/site-niche.css',
}
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function nodes(file, predicate) {
  const found = []
  function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit) }
  visit(file)
  return found
}
function attr(node, name) {
  return node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.text === name)?.initializer
}
const literalAttr = (node, name, value) => {
  const a = attr(node, name)
  return a && ts.isStringLiteral(a) && a.text === value
}
function rules(source) { const found = []; postcss.parse(source).walkRules(rule => found.push(rule)); return found }
const declares = (rule, prop, value) => rule.nodes.some(n => n.type === 'decl' && n.prop === prop && n.value === value)

export function verifyGeometrySources(source) {
  const file = parse(paths.pricing, source.pricing)
  const declarations = nodes(file, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'measure' && node.initializer && ts.isArrowFunction(node.initializer))
  assert.equal(declarations.length, 1, 'one actual pricing measure callback')
  const compiled = ts.transpileModule(`const measure = ${declarations[0].initializer.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  function measurement(width, height, mobile) {
    let size
    const callback = new Function('visRef', 'getComputedStyle', 'setVisS', 'naturalFlow', `${compiled}; return measure`)(
      { current: { clientWidth: width, clientHeight: height } },
      () => ({ paddingLeft: '4px', paddingRight: '4px', paddingTop: '4px', paddingBottom: '40px' }),
      value => { size = value }, () => mobile,
    )
    callback()
    return size
  }
  for (const [width, height, mobile, expected] of [[358,394,true,350],[358,180,true,350],[1,1,true,120],[358,180,true,350],[358,180,false,136],[454,600,false,446],[700,300,false,256]]) {
    assert.equal(measurement(width,height,mobile),expected,`pricing ${width}x${height} mobile=${mobile}`)
  }

  // Bind the CSS selectors to actual JSX source owners, without claiming SSR proof.
  const heading = parse(paths.heading, source.heading)
  const bands = nodes(heading, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(heading) === 'Band')
  assert(bands.some(band => nodes(band, node => ts.isJsxOpeningElement(node) && node.tagName.getText(heading) === 'h2' && attr(node,'className')?.getText(heading).includes('font-display')).length > 0), 'actual Heading Band contains display h2')
  for (const name of ['Eyebrow','Kicker']) assert(bands.some(band => nodes(band, node => ts.isJsxOpeningElement(node) && node.tagName.getText(heading) === name).length > 0), `Heading retains optional ${name}`)
  const niche = parse(paths.niche, source.niche)
  const section = nodes(niche, node => ts.isJsxElement(node) && literalAttr(node.openingElement,'id','how-it-works'))
  assert.equal(section.length,1,'one actual how-it-works section')
  assert(nodes(section[0], node => ts.isJsxOpeningElement(node) && literalAttr(node,'className','g3')).length > 0,'actual step grid owns g3')
  assert(nodes(section[0], node => ts.isJsxOpeningElement(node) && literalAttr(node,'className','pc nk-step')).length > 0,'actual grid contains step cards')
  const headingSelector = '[data-design="frequency"] [data-kit="site"] [data-site-blocks] section:has(> div.mx-auto:only-child > :is(h1,h2,h3).font-display):not(:has(> :not(div.mx-auto))):not(:has(> div.mx-auto > :not(:is(h1,h2,h3).font-display,p[data-text-role="eyebrow"],p.text-lead.italic))):not(:has(img,picture,svg,video,audio,canvas,iframe,object,embed))'
  const headingRules = rules(source.blocksCss).filter(rule => rule.selector === headingSelector)
  assert(headingRules.some(rule => declares(rule,'overflow','visible')),'semantic heading-only continuation permits glyph painting')
  const css = rules(source.nicheCss)
  const grid = css.filter(rule => rule.selector.endsWith('#how-it-works .g3'))
  assert(grid.some(rule => rule.parent.type !== 'atrule' && declares(rule,'grid-template-columns','repeat(3,minmax(0,1fr))')),'three desktop columns retained')
  assert(grid.some(rule => rule.parent.type === 'atrule' && rule.parent.name === 'media' && rule.parent.params === '(max-width:860px)' && declares(rule,'grid-template-columns','minmax(0,1fr)')),'mobile track has zero intrinsic floor')
  assert(css.some(rule => rule.selector.endsWith('#how-it-works .g3>.pop') && declares(rule,'min-width','0')),'step wrapper may shrink')
}

function isSentrySource(value) {
  try {
    const hostname = new URL(value).hostname
    return hostname.split('.').slice(-2).join('.') === 'sentry.io'
  } catch {
    return false
  }
}

export function verifyBrowserTransport(source) {
  const config = parse('next.config.ts', source)
  const policies = nodes(config, node => ts.isStringLiteral(node) && node.text.startsWith('connect-src '))
  assert.equal(policies.length, 1, 'one actual browser connection policy')
  const sentry = policies[0].text.split(/\s+/).filter(isSentrySource)
  assert.deepEqual(sentry, ['https://o4512171150934016.ingest.us.sentry.io'], 'only the configured organization ingest origin is permitted')
}
if (invokedDirectly(import.meta.url)) {
  verifyGeometrySources(Object.fromEntries(Object.entries(paths).map(([key,path]) => [key,readFileSync(path,'utf8')])))
  verifyBrowserTransport(readFileSync('next.config.ts', 'utf8'))
  console.log('ok: actual pricing callback has one mobile fixed point; canonical containment CSS binds actual renderer source; browser reporting permits only its configured ingest origin. Browser/SSR proof remains separate.')
}
