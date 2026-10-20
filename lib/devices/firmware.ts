import 'server-only'
import { createHash } from 'node:crypto'

// CYBERUNICORN FIRMWARE RELEASES (the "Update firmware" button on /admin/cyberunicorn). The firmware
// repo (public GitHub hellofrequencylab/projects) publishes a release tagged `cu5k-v<version>` with
// app.bin, full.bin and manifest.json. The browser cannot fetch a release asset itself (GitHub sends
// no CORS headers on the download), so the staff-only routes under app/api/v1/devices/firmware/ read
// it through this file and hand the bytes on.
//
// Only app.bin is ever served: the updater writes it at 0x10000, the app partition, exactly like
// `./flash.sh` without `--full`, so NVS (Wi-Fi, the device credential, settings) survives the update.
// The manifest is checked strictly, and the bytes are checked against it (size and sha256) before
// anything is returned, so a half-uploaded or mismatched release never reaches a board.
//
// Server-only. No admin client and no database: the only reads are GitHub's public REST API.

const REPO = 'hellofrequencylab/projects'
const TAG_PREFIX = 'cu5k-v'
const BOARD = 'cyd-2432s028r'
const APP_OFFSET = 0x10000
/** The board's whole flash. No app partition can be larger. */
const FLASH_BYTES = 4 * 1024 * 1024
/** How long a release listing and a manifest are cached, in seconds. */
const REVALIDATE_S = 300

/** The newest published firmware, as the staff console reads it. */
export interface FirmwareRelease {
  tag: string
  version: string
  commit: string
  publishedAt: string | null
  /** The release page on GitHub (its notes). */
  notesUrl: string
  /** The app image. `url` is OUR route, the one the browser downloads from. */
  app: { size: number; sha256: string; url: string }
}

/** The fields of manifest.json the updater relies on, after validation. */
interface FirmwareManifest {
  version: string
  commit: string
  app: { size: number; sha256: string }
}

interface GithubAsset {
  name: string
  size: number
  url: string
}

interface GithubRelease {
  tag: string
  publishedAt: string | null
  notesUrl: string
  assets: GithubAsset[]
}

/** A tag this updater will serve: `cu5k-v` plus a semver version. Anything else is refused outright. */
const TAG_RE = /^cu5k-v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

/**
 * Validate a manifest.json body for `tag`, or null. Strict on purpose: the right board, the app
 * image at 0x10000, a size that fits the app partition, a 64-hex sha256, and a version that matches
 * the tag the manifest was published under.
 */
export function parseManifest(raw: unknown, tag: string): FirmwareManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const m = raw as Record<string, unknown>
  const tagVersion = TAG_RE.exec(tag)?.[1]
  if (!tagVersion) return null
  if (m.board !== BOARD) return null
  if (m.version !== tagVersion) return null
  if (typeof m.commit !== 'string' || !/^[0-9a-f]{7,40}$/i.test(m.commit)) return null
  if (m.proto !== undefined && (!isInt(m.proto) || m.proto < 1)) return null
  const partition = m.app_partition_size
  if (!isInt(partition) || partition <= 0 || partition > FLASH_BYTES - APP_OFFSET) return null
  const app = m.app
  if (!app || typeof app !== 'object' || Array.isArray(app)) return null
  const a = app as Record<string, unknown>
  if (a.file !== 'app.bin') return null
  if (a.offset !== APP_OFFSET) return null
  if (!isInt(a.size) || a.size <= 0 || a.size > partition) return null
  if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(a.sha256)) return null
  return { version: tagVersion, commit: m.commit.toLowerCase(), app: { size: a.size, sha256: a.sha256.toLowerCase() } }
}

function parseRelease(raw: unknown): (GithubRelease & { draft: boolean; prerelease: boolean }) | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.tag_name !== 'string') return null
  const assets = Array.isArray(r.assets)
    ? r.assets.flatMap((x): GithubAsset[] => {
        const a = x as Record<string, unknown> | null
        return a && typeof a.name === 'string' && isInt(a.size) && typeof a.browser_download_url === 'string'
          ? [{ name: a.name, size: a.size, url: a.browser_download_url }]
          : []
      })
    : []
  return {
    tag: r.tag_name,
    publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
    notesUrl: typeof r.html_url === 'string' ? r.html_url : `https://github.com/${REPO}/releases/tag/${encodeURIComponent(r.tag_name)}`,
    assets,
    draft: r.draft === true,
    prerelease: r.prerelease === true,
  }
}

/**
 * The newest published CyberUnicorn release in a GitHub release listing, or null. Drafts,
 * prereleases, other projects' tags and releases missing app.bin or manifest.json are skipped;
 * "newest" is by published date (GitHub's own order is by creation, which a re-tag can upset).
 */
export function pickRelease(list: unknown): GithubRelease | null {
  if (!Array.isArray(list)) return null
  const candidates = list
    .map(parseRelease)
    .filter((r): r is NonNullable<ReturnType<typeof parseRelease>> => r !== null)
    .filter((r) => !r.draft && !r.prerelease && r.tag.startsWith(TAG_PREFIX) && TAG_RE.test(r.tag))
    .filter((r) => r.assets.some((a) => a.name === 'app.bin') && r.assets.some((a) => a.name === 'manifest.json'))
  candidates.sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '') || 0)
  const top = candidates[0]
  return top ? { tag: top.tag, publishedAt: top.publishedAt, notesUrl: top.notesUrl, assets: top.assets } : null
}

function githubHeaders(accept: string): HeadersInit {
  const h: Record<string, string> = {
    accept,
    'user-agent': 'frequency-web-firmware',
    'x-github-api-version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) h.authorization = `Bearer ${token}`
  return h
}

/** Thrown when GitHub cannot be read or a release does not check out. The message is staff-facing. */
export class FirmwareError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirmwareError'
  }
}

async function listReleases(): Promise<unknown> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
    headers: githubHeaders('application/vnd.github+json'),
    next: { revalidate: REVALIDATE_S },
  })
  if (!res.ok) throw new FirmwareError(`GitHub answered ${res.status} for the release list. Try again in a few minutes.`)
  return res.json()
}

async function readManifest(release: GithubRelease): Promise<FirmwareManifest> {
  const asset = release.assets.find((a) => a.name === 'manifest.json')
  if (!asset) throw new FirmwareError(`Release ${release.tag} has no manifest.json.`)
  const res = await fetch(asset.url, {
    headers: githubHeaders('application/octet-stream'),
    redirect: 'follow',
    next: { revalidate: REVALIDATE_S },
  })
  if (!res.ok) throw new FirmwareError(`Could not download the manifest for ${release.tag} (GitHub answered ${res.status}).`)
  const body: unknown = await res.json().catch(() => null)
  const manifest = parseManifest(body, release.tag)
  if (!manifest) throw new FirmwareError(`The manifest for ${release.tag} does not check out, so it will not be offered.`)
  const app = release.assets.find((a) => a.name === 'app.bin')
  if (!app || app.size !== manifest.app.size) throw new FirmwareError(`app.bin in ${release.tag} is not the size its manifest says.`)
  return manifest
}

/** Where the browser downloads a release's app image: our own staff-only route. */
function appRoute(tag: string): string {
  return `/api/v1/devices/firmware/app?tag=${encodeURIComponent(tag)}`
}

/**
 * The newest published firmware, or null when none is published yet. Throws FirmwareError when
 * GitHub cannot be read or the newest release's manifest is wrong (it does not fall back to an
 * older release: a broken release is something staff should hear about, not route around).
 */
export async function latestFirmware(): Promise<FirmwareRelease | null> {
  const release = pickRelease(await listReleases())
  if (!release) return null
  const manifest = await readManifest(release)
  return {
    tag: release.tag,
    version: manifest.version,
    commit: manifest.commit,
    publishedAt: release.publishedAt,
    notesUrl: release.notesUrl,
    app: { size: manifest.app.size, sha256: manifest.app.sha256, url: appRoute(release.tag) },
  }
}

async function releaseByTag(tag: string): Promise<GithubRelease | null> {
  const listed = await listReleases()
  const fromList = Array.isArray(listed) ? listed.map(parseRelease).find((r) => r?.tag === tag) : undefined
  let r = fromList ?? null
  if (!r) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: githubHeaders('application/vnd.github+json'),
      next: { revalidate: REVALIDATE_S },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new FirmwareError(`GitHub answered ${res.status} for release ${tag}.`)
    r = parseRelease(await res.json())
  }
  if (!r || r.draft || r.prerelease) return null
  return r
}

/**
 * Download app.bin for exactly `tag`, checked against that release's manifest (size and sha256).
 * Null when the tag is not a published CyberUnicorn release. Throws FirmwareError on a download
 * failure or a mismatch. The image is at most the app partition (3.9 MB), so it is held in memory
 * to be hashed; the read stops as soon as it runs past the manifest's size.
 */
export async function fetchFirmwareApp(tag: string): Promise<{ bytes: Uint8Array; sha256: string; version: string } | null> {
  if (!TAG_RE.test(tag)) return null
  const release = await releaseByTag(tag)
  if (!release) return null
  const manifest = await readManifest(release)
  const asset = release.assets.find((a) => a.name === 'app.bin')
  if (!asset) return null
  // No data cache here: the image is larger than Next's per-entry fetch cache allows.
  const res = await fetch(asset.url, { headers: githubHeaders('application/octet-stream'), redirect: 'follow', cache: 'no-store' })
  if (!res.ok || !res.body) throw new FirmwareError(`Could not download app.bin for ${tag} (GitHub answered ${res.status}).`)
  const want = manifest.app.size
  const bytes = new Uint8Array(want)
  let got = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (got + value.byteLength > want) {
      await reader.cancel().catch(() => {})
      throw new FirmwareError(`app.bin for ${tag} is larger than its manifest says.`)
    }
    bytes.set(value, got)
    got += value.byteLength
  }
  if (got !== want) throw new FirmwareError(`app.bin for ${tag} is smaller than its manifest says.`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== manifest.app.sha256) throw new FirmwareError(`app.bin for ${tag} does not match its manifest checksum.`)
  return { bytes, sha256, version: manifest.version }
}
