import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { applyQuery, buildApplyUrl } from './apply-url'
import { verifyQuery } from './signer'
import { DC_KEY_HOST, DC_PROVIDER_ID, DC_PUB_KEY_DOMAIN, DC_RETURN_PATH, DC_SERVICE_ID } from './constants'
import template from './frequencylocal.com.website.json'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

const input = {
  urlSyncUX: 'https://dcc.godaddy.com/manage/',
  domain: 'yourname.com',
  variables: { target: 'cname.vercel-dns.com', ip: '76.76.21.21' },
  redirectUri: `https://frequencylocal.com${DC_RETURN_PATH}`,
  state: 'abc.def',
  privateKey,
}

describe('applyQuery', () => {
  it('orders domain, the sorted variables, redirect_uri, then state', () => {
    expect(applyQuery(input)).toBe(
      'domain=yourname.com&ip=76.76.21.21&target=cname.vercel-dns.com' +
        '&redirect_uri=https%3A%2F%2Ffrequencylocal.com%2Fapi%2Fsites%2Fdomain-connect%2Freturn&state=abc.def',
    )
  })
})

describe('buildApplyUrl', () => {
  it('points at the provider sync UX apply path for Frequency\'s template', () => {
    const url = new URL(buildApplyUrl(input))
    expect(url.origin).toBe('https://dcc.godaddy.com')
    expect(url.pathname).toBe(`/manage/v2/domainTemplates/providers/${DC_PROVIDER_ID}/services/${DC_SERVICE_ID}/apply`)
    expect(url.searchParams.get('domain')).toBe('yourname.com')
    expect(url.searchParams.get('ip')).toBe('76.76.21.21')
    expect(url.searchParams.get('target')).toBe('cname.vercel-dns.com')
    expect(url.searchParams.get('redirect_uri')).toBe(input.redirectUri)
    expect(url.searchParams.get('state')).toBe('abc.def')
    expect(url.searchParams.get('key')).toBe(DC_KEY_HOST)
  })

  it('ends with sig then key, and sig verifies over the query before it', () => {
    const raw = buildApplyUrl(input)
    const query = raw.slice(raw.indexOf('?') + 1, raw.indexOf('&sig='))
    expect(raw.endsWith(`&key=${DC_KEY_HOST}`)).toBe(true)
    const sig = new URL(raw).searchParams.get('sig')!
    expect(query).toBe(applyQuery(input))
    expect(verifyQuery(query, sig, publicKey)).toBe(true)
  })
})

describe('the template file', () => {
  it('carries the same ids the app signs and returns with', () => {
    expect(template.providerId).toBe(DC_PROVIDER_ID)
    expect(template.serviceId).toBe(DC_SERVICE_ID)
    expect(template.syncPubKeyDomain).toBe(DC_PUB_KEY_DOMAIN)
    expect(template.syncRedirectDomain).toBe(new URL(input.redirectUri).hostname)
  })

  it('sets the apex A and the www CNAME from the variables the apply URL passes', () => {
    expect(template.records).toEqual([
      expect.objectContaining({ type: 'A', host: '@', pointsTo: '%ip%' }),
      expect.objectContaining({ type: 'CNAME', host: 'www', pointsTo: '%target%' }),
    ])
    for (const name of Object.keys(input.variables)) expect(JSON.stringify(template.records)).toContain(`%${name}%`)
  })
})
