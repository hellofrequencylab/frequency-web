import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function load(path, dependencies = {}) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const loaded = { exports: {} }
  const resolve = name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }
  new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: path }).runInNewContext({ URL, URLSearchParams })(resolve, loaded, loaded.exports)
  return loaded.exports
}
const compose = load('lib/growth/link-compose.ts', { '@/lib/qr/codes': {} })
const mail = load('lib/email-studio/utm.ts', { '@/lib/growth/link-compose': compose })
const { pixelSafeAttributionQuery: sanitize } = load('lib/analytics/sanitize.ts')
const appendCampaign = mail.appendCampaignUtm ?? ((html, opts) => mail.appendUtm(html, { siteUrl: opts.siteUrl, campaign: `email-${opts.campaignId.slice(0, 8)}` }))
const ids = ['ab12cd34-1234-4567-890a-0123456789ab', 'ab12cd34-1234-4567-890a-0123456789ac']
for (const campaignId of ids) {
  const html = appendCampaign('<a href="https://frequencylocal.com/community">Visit</a>', { siteUrl: 'https://frequencylocal.com', campaignId })
  const url = new URL(html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'))
  assert.equal(url.searchParams.get('utm_campaign'), campaignId, 'Full campaign identity must survive mail composition')
  assert.equal(new URLSearchParams(sanitize(url.search)).get('utm_campaign'), campaignId, 'Actual mail links must survive the pixel privacy boundary')
}
const query = '?utm_source=frequency&utm_medium=email&utm_campaign=email-ab12cd34'
assert.equal(sanitize(query), query, 'Previously sent opaque legacy IDs must survive')
for (const campaign of ['email-danielxx', 'email-ab12cd34-private', 'newsletter', 'mind-body-spirit', 'person@example.test']) {
  assert.equal(new URLSearchParams(sanitize('?utm_source=frequency&utm_medium=email&utm_campaign=' + encodeURIComponent(campaign))).has('utm_campaign'), false)
}
assert.equal(new URLSearchParams(sanitize('?utm_source=google&utm_medium=cpc&utm_campaign=email-ab12cd34')).has('utm_campaign'), false)
assert.equal(new URLSearchParams(sanitize('?utm_source=frequency&utm_medium=email&utm_id=email-ab12cd34')).has('utm_id'), false)
const send = readFileSync(new URL('../../lib/email-studio/send.ts', import.meta.url), 'utf8')
assert.ok(send.includes("import { appendCampaignUtm as appendUtm } from './utm'"), 'Delivery must bind the validated campaign builder')
assert.equal((send.match(/appendUtm\(applyMergeTags/g) ?? []).length, 2, 'Both delivery paths must use the real shared campaign builder')
assert.equal(send.includes('campaignId.slice(0, 8)'), false, 'Delivery must not collapse distinct campaigns sharing a prefix')
// The sanitizer also runs from its serialized function body in the root bootstrap.
const inlineSanitize = vm.runInNewContext('(' + sanitize.toString() + ')', { URLSearchParams })
assert.equal(inlineSanitize(query), query)
console.log('Email campaign attribution passed: full opaque IDs, legacy compatibility, closed privacy boundary and both delivery paths.')
