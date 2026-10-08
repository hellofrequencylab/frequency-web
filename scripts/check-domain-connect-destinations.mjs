// LIVE-885: execute the discovery module against synthetic TXT/HTTP responses; no live requests.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export async function verifyDomainConnectDestinations() {
  let txt = [], body = null
  const requests = []
  const output = ts.transpileModule(readFileSync('lib/sites/domain-connect/discovery.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const api = {}
  const resolve = name => {
    if (name === 'node:dns/promises') return { resolveTxt: async () => txt }
    if (name === './constants') return { DC_PROVIDER_ID: 'frequencylocal.com', DC_SERVICE_ID: 'website' }
    if (name === './signer') return { loadSigningKey: () => null }
    if (name === './apply-url') return { buildApplyUrl: input => `${input.urlSyncUX}/apply` }
    throw new Error(`Unexpected dependency ${name}`)
  }
  const fetch = async (url, options) => {
    requests.push({ url, options })
    assert.equal(options.redirect, 'error', 'provider redirects remain disabled')
    assert.equal(options.cache, 'no-store')
    return { ok: true, json: async () => body }
  }
  new Function('require', 'exports', 'fetch', output)(resolve, api, fetch)
  const godaddy = { providerName: 'GoDaddy', urlAPI: 'https://domainconnect.api.godaddy.com', urlSyncUX: 'https://dcc.godaddy.com/manage' }
  const cloudflare = { providerName: 'Cloudflare', urlAPI: 'https://api.cloudflare.com/client/v4/dns/domainconnect', urlSyncUX: 'https://dash.cloudflare.com/domainconnect' }
  // An attacker-controlled hostname is denied without resolving/fetching its private address.
  for (const base of ['private-resolving.attacker.example', '127.0.0.1', '169.254.169.254', 'domainconnect.godaddy.com.attacker.example', 'domainconnect.godaddy.com:443', 'api.cloudflare.com/client/v4/dns/domainconnect/../private', 'api.cloudflare.com/client/v4/dns/domainconnect%2fprivate', 'domainconnect.godaddy.com?x=1', 'domainconnect.godaddy.com#x', 'domainconnect.godaddy.com?', 'domainconnect.godaddy.com#', 'http://domainconnect.godaddy.com', 'dcc.godaddy.com/manage', 'domainconnect.ionos.com']) {
    txt = [[base]]; requests.length = 0
    assert.equal(await api.readDomainConnectSettings('owner.example'), null, base)
    assert.equal(requests.length, 0, base)
  }
  for (const [discovery, settings] of [['domainconnect.godaddy.com', godaddy], ['domainconnect.api.godaddy.com', godaddy], ['api.cloudflare.com/client/v4/dns/domainconnect', cloudflare]]) {
    txt = [[discovery]]; body = settings; requests.length = 0
    assert.deepEqual(await api.readDomainConnectSettings('owner.example'), settings)
    assert.equal(await api.templateSupported(settings.urlAPI), true)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].url, `https://${discovery}/v2/owner.example/settings`)
    assert.equal(requests[1].url, `${settings.urlAPI}/v2/domainTemplates/providers/frequencylocal.com/services/website`)
  }
  for (const settings of [{ ...godaddy, urlAPI: 'https://private-resolving.attacker.example' }, { ...godaddy, urlSyncUX: 'https://private-resolving.attacker.example' }, cloudflare, { ...godaddy, urlSyncUX: cloudflare.urlSyncUX }]) {
    txt = [['domainconnect.godaddy.com']]; body = settings; requests.length = 0
    assert.deepEqual(await api.findOneClickConnect({ domain: 'owner.example', privateKey: {}, variables: {}, redirectUri: 'https://frequencylocal.com/return', state: 'state' }), { supported: false })
    assert.equal(requests.length, 1, 'malicious settings never cause the second request')
  }
  for (const base of ['https://private-resolving.attacker.example', 'https://domainconnect.godaddy.com', 'https://domainconnect.api.godaddy.com:443', 'https://domainconnect.api.godaddy.com/private', 'https://domainconnect.api.godaddy.com?x=1', 'https://domainconnect.api.godaddy.com/#x', 'https://domainconnect.api.godaddy.com/%2f']) {
    requests.length = 0
    assert.equal(await api.templateSupported(base), false)
    assert.equal(requests.length, 0, 'direct API bypass rejected before fetch')
  }
  for (const domain of ['../../private', 'owner.example%2fprivate', 'owner..example']) {
    requests.length = 0
    assert.equal(await api.readDomainConnectSettings(domain), null)
    assert.equal(requests.length, 0)
  }
  return 'reviewed GoDaddy/Cloudflare destinations and same-provider settings only; unreviewed/private and direct API bypass denied before HTTP'
}
if (invokedDirectly(import.meta.url)) console.log(`LIVE-885: ${await verifyDomainConnectDestinations()}`)
