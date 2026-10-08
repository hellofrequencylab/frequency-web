import { verifyDomainConnectDestinations } from '../../../scripts/check-domain-connect-destinations.mjs'
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveTxt = vi.fn()
vi.mock('node:dns/promises', () => ({ resolveTxt: (...args: unknown[]) => resolveTxt(...args) }))

import {
  apiBaseFromTxt,
  findOneClickConnect,
  parseSettings,
  readDomainConnectSettings,
  safeHttpsBase,
  templateSupported,
} from './discovery'
import { verifyQuery } from './signer'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

const SETTINGS = {
  providerId: 'godaddy.com',
  providerName: 'GoDaddy',
  providerDisplayName: 'GoDaddy',
  urlSyncUX: 'https://dcc.godaddy.com/manage',
  urlAsyncUX: 'https://dcc.godaddy.com/manage',
  urlAPI: 'https://domainconnect.api.godaddy.com',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  resolveTxt.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safeHttpsBase', () => {
  it('keeps a plain https base and drops a trailing slash', () => {
    expect(safeHttpsBase('https://api.cloudflare.com/client/v4/dns/domainconnect/')).toBe(
      'https://api.cloudflare.com/client/v4/dns/domainconnect',
    )
  })

  it('refuses other schemes, IPs, localhost, ports, credentials and junk', () => {
    for (const bad of [
      'http://dcc.godaddy.com',
      'https://127.0.0.1',
      'https://169.254.169.254/latest',
      'https://localhost',
      'https://intranet',
      'https://dcc.godaddy.com:8443',
      'https://user:pw@dcc.godaddy.com',
      'javascript:alert(1)',
      42,
      null,
    ]) {
      expect(safeHttpsBase(bad)).toBeNull()
    }
  })
})

describe('apiBaseFromTxt', () => {
  it('joins TXT chunks and makes an https base', () => {
    expect(apiBaseFromTxt([['domainconnect.', 'godaddy.com']])).toBe('https://domainconnect.godaddy.com')
    expect(apiBaseFromTxt([['api.cloudflare.com/client/v4/dns/domainconnect']])).toBe(
      'https://api.cloudflare.com/client/v4/dns/domainconnect',
    )
  })

  it('is null for nothing usable', () => {
    expect(apiBaseFromTxt([])).toBeNull()
    expect(apiBaseFromTxt([['10.0.0.1']])).toBeNull()
  })
})

describe('parseSettings', () => {
  it('reads the provider name and the two URLs', () => {
    expect(parseSettings(SETTINGS)).toEqual({
      providerName: 'GoDaddy',
      urlSyncUX: 'https://dcc.godaddy.com/manage',
      urlAPI: 'https://domainconnect.api.godaddy.com',
    })
  })

  it('falls back to providerName and strips markup characters', () => {
    expect(parseSettings({ ...SETTINGS, providerDisplayName: undefined, providerName: '<b>IONOS</b>' })?.providerName).toBe(
      'bIONOS/b',
    )
  })

  it('is null without a sync URL, an API URL or a name', () => {
    expect(parseSettings({ ...SETTINGS, urlSyncUX: undefined })).toBeNull()
    expect(parseSettings({ ...SETTINGS, urlAPI: 'http://insecure.example' })).toBeNull()
    expect(parseSettings({ ...SETTINGS, providerName: '', providerDisplayName: '' })).toBeNull()
    expect(parseSettings(null)).toBeNull()
    expect(parseSettings('nope')).toBeNull()
  })
})

describe('readDomainConnectSettings', () => {
  it('looks up _domainconnect and fetches the settings from the named host', async () => {
    resolveTxt.mockResolvedValue([['domainconnect.godaddy.com']])
    fetchMock.mockResolvedValue(json(SETTINGS))
    const s = await readDomainConnectSettings('yourname.com')
    expect(resolveTxt).toHaveBeenCalledWith('_domainconnect.yourname.com')
    expect(fetchMock.mock.calls[0][0]).toBe('https://domainconnect.godaddy.com/v2/yourname.com/settings')
    expect(s?.providerName).toBe('GoDaddy')
  })

  it('is null, without throwing, when there is no TXT record', async () => {
    resolveTxt.mockRejectedValue(Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' }))
    await expect(readDomainConnectSettings('yourname.com')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is null when the settings call fails or errors', async () => {
    resolveTxt.mockResolvedValue([['domainconnect.godaddy.com']])
    fetchMock.mockResolvedValueOnce(json({}, 404))
    await expect(readDomainConnectSettings('yourname.com')).resolves.toBeNull()
    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    await expect(readDomainConnectSettings('yourname.com')).resolves.toBeNull()
  })
})

describe('templateSupported', () => {
  it('asks the provider API for Frequency\'s template and reads 200 as yes', async () => {
    fetchMock.mockResolvedValueOnce(json({ version: 1 }))
    await expect(templateSupported('https://domainconnect.api.godaddy.com')).resolves.toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://domainconnect.api.godaddy.com/v2/domainTemplates/providers/frequencylocal.com/services/website',
    )
  })

  it('reads 404 or a network error as no', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404))
    await expect(templateSupported('https://domainconnect.api.godaddy.com')).resolves.toBe(false)
    fetchMock.mockRejectedValueOnce(new Error('reset'))
    await expect(templateSupported('https://domainconnect.api.godaddy.com')).resolves.toBe(false)
  })
})

describe('findOneClickConnect', () => {
  const base = {
    domain: 'yourname.com',
    variables: { ip: '76.76.21.21', target: 'cname.vercel-dns.com' },
    redirectUri: 'https://frequencylocal.com/api/sites/domain-connect/return',
    state: 'abc.def',
  }

  it('is unsupported with no network call when there is no signing key', async () => {
    await expect(findOneClickConnect({ ...base, privateKey: null })).resolves.toEqual({ supported: false })
    expect(resolveTxt).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the env key by default, and is unsupported when it is absent', async () => {
    const before = process.env.DOMAIN_CONNECT_PRIVATE_KEY
    delete process.env.DOMAIN_CONNECT_PRIVATE_KEY
    await expect(findOneClickConnect(base)).resolves.toEqual({ supported: false })
    if (before !== undefined) process.env.DOMAIN_CONNECT_PRIVATE_KEY = before
  })

  it('is unsupported when the provider has not onboarded the template', async () => {
    resolveTxt.mockResolvedValue([['domainconnect.godaddy.com']])
    fetchMock.mockResolvedValueOnce(json(SETTINGS)).mockResolvedValueOnce(json({}, 404))
    await expect(findOneClickConnect({ ...base, privateKey })).resolves.toEqual({ supported: false })
  })

  it('returns the provider name and a signed apply URL when everything lines up', async () => {
    resolveTxt.mockResolvedValue([['domainconnect.godaddy.com']])
    fetchMock.mockResolvedValueOnce(json(SETTINGS)).mockResolvedValueOnce(json({ version: 1 }))
    const r = await findOneClickConnect({ ...base, privateKey })
    expect(r.supported).toBe(true)
    if (!r.supported) return
    expect(r.providerName).toBe('GoDaddy')
    expect(r.applyUrl.startsWith('https://dcc.godaddy.com/manage/v2/domainTemplates/providers/frequencylocal.com/services/website/apply?')).toBe(true)
    const query = r.applyUrl.slice(r.applyUrl.indexOf('?') + 1, r.applyUrl.indexOf('&sig='))
    expect(verifyQuery(query, new URL(r.applyUrl).searchParams.get('sig')!, publicKey)).toBe(true)
  })
})


describe('reviewed provider network boundary (LIVE-885)', () => {
  const cloudflare = { providerName: 'Cloudflare', urlAPI: 'https://api.cloudflare.com/client/v4/dns/domainconnect', urlSyncUX: 'https://dash.cloudflare.com/domainconnect' }
  it.each([
    'private-resolving.attacker.example', 'domainconnect.godaddy.com.attacker.example',
    'domainconnect.godaddy.com:443', 'http://domainconnect.godaddy.com',
    'domainconnect.godaddy.com?', 'domainconnect.godaddy.com#', 'domainconnect.godaddy.com?url=private',
    'api.cloudflare.com/client/v4/dns/domainconnect/../private',
    'api.cloudflare.com/client/v4/dns/domainconnect%2fprivate',
    'api.cloudflare.com/client/v4/dns/domainconnect#private',
    'dcc.godaddy.com/manage', 'domainconnect.ionos.com',
  ])('rejects unreviewed discovery %s before any HTTP request', async destination => {
    resolveTxt.mockResolvedValue([[destination]])
    await expect(readDomainConnectSettings('owner.example')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('accepts the reviewed Cloudflare pair with redirects disabled', async () => {
    resolveTxt.mockResolvedValue([['api.cloudflare.com/client/v4/dns/domainconnect']])
    fetchMock.mockResolvedValue(json(cloudflare))
    await expect(readDomainConnectSettings('owner.example')).resolves.toEqual(cloudflare)
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error')
  })
  it.each([
    { ...SETTINGS, urlAPI: 'https://private-resolving.attacker.example' },
    { ...SETTINGS, urlSyncUX: 'https://private-resolving.attacker.example' },
    { ...SETTINGS, urlAPI: cloudflare.urlAPI, urlSyncUX: cloudflare.urlSyncUX },
    { ...SETTINGS, urlSyncUX: cloudflare.urlSyncUX },
  ])('rejects malicious or cross-provider returned settings', async settings => {
    resolveTxt.mockResolvedValue([['domainconnect.godaddy.com']])
    fetchMock.mockResolvedValue(json(settings))
    await expect(readDomainConnectSettings('owner.example')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it.each(['https://private-resolving.attacker.example', 'https://domainconnect.godaddy.com', 'https://domainconnect.api.godaddy.com:443', 'https://domainconnect.api.godaddy.com/private', 'https://domainconnect.api.godaddy.com?x=1', 'https://domainconnect.api.godaddy.com/#x'])('rejects direct template API bypass %s', async destination => {
    await expect(templateSupported(destination)).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

it('runs the standalone destination consequence proof', async () => {
  await expect(verifyDomainConnectDestinations()).resolves.toContain('direct API bypass denied before HTTP')
})
