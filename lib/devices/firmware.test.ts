import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFirmwareApp, latestFirmware, parseManifest, pickRelease } from './firmware'

const SHA = 'a'.repeat(64)

function manifest(over: Record<string, unknown> = {}, app: Record<string, unknown> = {}) {
  return {
    board: 'cyd-2432s028r',
    os: 'CyberUnicorn 5000',
    version: '0.1.0',
    commit: 'abc1234',
    bruce_version: '1.16.1',
    proto: 1,
    app: { file: 'app.bin', offset: 65536, size: 1000, sha256: SHA, ...app },
    app_partition_size: 3932160,
    ...over,
  }
}

function release(tag: string, over: Record<string, unknown> = {}, appSize = 1000) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: '2026-10-01T00:00:00Z',
    html_url: `https://github.com/hellofrequencylab/projects/releases/tag/${tag}`,
    assets: [
      { name: 'app.bin', size: appSize, browser_download_url: `https://dl.example/${tag}/app.bin` },
      { name: 'full.bin', size: 4194304, browser_download_url: `https://dl.example/${tag}/full.bin` },
      { name: 'manifest.json', size: 300, browser_download_url: `https://dl.example/${tag}/manifest.json` },
    ],
    ...over,
  }
}

describe('parseManifest', () => {
  it('accepts the published shape and lowercases the checksum', () => {
    const m = parseManifest(manifest({}, { sha256: 'A'.repeat(64) }), 'cu5k-v0.1.0')
    expect(m).toEqual({ version: '0.1.0', commit: 'abc1234', app: { size: 1000, sha256: SHA } })
  })

  it.each([
    ['another board', manifest({ board: 'esp32-s3' })],
    ['a version that is not the tag', manifest({ version: '0.2.0' })],
    ['a non-hex commit', manifest({ commit: 'not a sha' })],
    ['the app anywhere but 0x10000', manifest({}, { offset: 0 })],
    ['a file other than app.bin', manifest({}, { file: 'full.bin' })],
    ['an app larger than its partition', manifest({}, { size: 3932161 })],
    ['a zero size', manifest({}, { size: 0 })],
    ['a short sha256', manifest({}, { sha256: 'ab'.repeat(16) })],
    ['a partition bigger than the flash', manifest({ app_partition_size: 8 * 1024 * 1024 }, { size: 1000 })],
    ['a bad proto', manifest({ proto: 0 })],
  ])('refuses %s', (_label, body) => {
    expect(parseManifest(body, 'cu5k-v0.1.0')).toBeNull()
  })

  it('refuses a tag that is not a cu5k release, and a non-object', () => {
    expect(parseManifest(manifest(), 'v0.1.0')).toBeNull()
    expect(parseManifest(null, 'cu5k-v0.1.0')).toBeNull()
    expect(parseManifest([], 'cu5k-v0.1.0')).toBeNull()
  })
})

describe('pickRelease', () => {
  it('picks the newest published cu5k release, skipping drafts, prereleases and other tags', () => {
    const picked = pickRelease([
      release('cu5k-v0.3.0', { draft: true, published_at: '2026-10-09T00:00:00Z' }),
      release('cu5k-v0.2.1', { prerelease: true, published_at: '2026-10-08T00:00:00Z' }),
      release('flipper-v9.0.0', { published_at: '2026-10-07T00:00:00Z' }),
      release('cu5k-v0.1.0', { published_at: '2026-10-01T00:00:00Z' }),
      release('cu5k-v0.2.0', { published_at: '2026-10-05T00:00:00Z' }),
    ])
    expect(picked?.tag).toBe('cu5k-v0.2.0')
  })

  it('skips a release missing its manifest or app image', () => {
    const noManifest = release('cu5k-v0.2.0', { published_at: '2026-10-05T00:00:00Z' })
    noManifest.assets = noManifest.assets.filter((a) => a.name !== 'manifest.json')
    expect(pickRelease([noManifest, release('cu5k-v0.1.0')])?.tag).toBe('cu5k-v0.1.0')
  })

  it('is null when nothing is published', () => {
    expect(pickRelease([])).toBeNull()
    expect(pickRelease({ message: 'Not Found' })).toBeNull()
  })
})

describe('latestFirmware and fetchFirmwareApp (mocked GitHub)', () => {
  const image = new Uint8Array(1000).map((_, i) => i % 251)
  const imageSha = createHash('sha256').update(image).digest('hex')
  let routes: Record<string, () => Response>

  beforeEach(() => {
    routes = {
      'https://api.github.com/repos/hellofrequencylab/projects/releases?per_page=20': () => Response.json([release('cu5k-v0.1.0')]),
      'https://dl.example/cu5k-v0.1.0/manifest.json': () => Response.json(manifest({}, { sha256: imageSha })),
      'https://dl.example/cu5k-v0.1.0/app.bin': () => new Response(image),
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (routes[url] ? routes[url]() : new Response('nope', { status: 404 }))),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('answers null when no release is published yet', async () => {
    routes['https://api.github.com/repos/hellofrequencylab/projects/releases?per_page=20'] = () => Response.json([])
    await expect(latestFirmware()).resolves.toBeNull()
  })

  it('returns the release with our own download route', async () => {
    await expect(latestFirmware()).resolves.toEqual({
      tag: 'cu5k-v0.1.0',
      version: '0.1.0',
      commit: 'abc1234',
      publishedAt: '2026-10-01T00:00:00Z',
      notesUrl: 'https://github.com/hellofrequencylab/projects/releases/tag/cu5k-v0.1.0',
      app: { size: 1000, sha256: imageSha, url: '/api/v1/devices/firmware/app?tag=cu5k-v0.1.0' },
    })
  })

  it('throws, rather than answering null, when GitHub fails or the manifest is wrong', async () => {
    routes['https://dl.example/cu5k-v0.1.0/manifest.json'] = () => Response.json(manifest({ board: 'other' }))
    await expect(latestFirmware()).rejects.toThrow(/does not check out/)
    routes['https://api.github.com/repos/hellofrequencylab/projects/releases?per_page=20'] = () => new Response('', { status: 403 })
    await expect(latestFirmware()).rejects.toThrow(/403/)
  })

  it('downloads app.bin for the exact tag and checks it', async () => {
    const got = await fetchFirmwareApp('cu5k-v0.1.0')
    expect(got?.sha256).toBe(imageSha)
    expect(got?.bytes).toEqual(image)
  })

  it('refuses a malformed tag without asking GitHub, and an unknown tag as null', async () => {
    await expect(fetchFirmwareApp('../../etc')).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    await expect(fetchFirmwareApp('cu5k-v9.9.9')).resolves.toBeNull()
  })

  it('refuses an image whose bytes do not match the manifest', async () => {
    routes['https://dl.example/cu5k-v0.1.0/app.bin'] = () => new Response(new Uint8Array(1000))
    await expect(fetchFirmwareApp('cu5k-v0.1.0')).rejects.toThrow(/checksum/)
    routes['https://dl.example/cu5k-v0.1.0/app.bin'] = () => new Response(new Uint8Array(1001))
    await expect(fetchFirmwareApp('cu5k-v0.1.0')).rejects.toThrow(/larger/)
  })
})
