// ─────────────────────────────────────────────────────────────────────────────
// The web tool seam (docs/BUSINESS-IMPORTER.md §6.3). The codebase had NO web tool
// before this; the Smart Business Importer is the first caller. Isolated behind ONE
// small interface so the provider (a fetch + search API, or Anthropic server-side
// tools later) is a one-line swap and the rest of the pipeline depends only on the
// interface, never on a vendor.
//
//   fetchUrl(url)   -> readable text (+ trimmed html for og/logo parse, + status)
//   searchWeb(query) -> a handful of { title, url, snippet } results
//
// FAIL-SAFE by contract: neither throws. A network error, a non-2xx, a timeout, or a
// missing search provider degrades to an empty/failed result the harvest records as a
// source with its http status, so a dead page NEVER crashes the pipeline (docs §7). SSRF
// guard: only public http(s) hosts are fetched (no localhost / private ranges / non-http
// schemes), since the crawl seed is operator-supplied.
// ─────────────────────────────────────────────────────────────────────────────

/** The readable result of fetching one url. `ok` is false for any failure (never throws). */
export interface WebFetchResult {
  ok: boolean
  url: string
  status: number
  /** Final url after redirects (for provenance). */
  finalUrl?: string
  title?: string
  /** Extracted readable text (tags stripped, whitespace-collapsed, length-bounded). */
  text?: string
  /** Trimmed <head> html for og/logo parsing only (never the whole document). */
  headHtml?: string
  contentType?: string
  error?: string
}

/** One web-search hit. */
export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

/** The provider interface the pipeline depends on. Swappable; the default impl below uses
 *  plain `fetch` + an optional search API key. */
export interface WebProvider {
  fetchUrl(url: string, opts?: { timeoutMs?: number; maxBytes?: number }): Promise<WebFetchResult>
  searchWeb(query: string, opts?: { count?: number; timeoutMs?: number }): Promise<WebSearchResult[]>
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 1_500_000 // ~1.5MB page cap; enough for text + head, bounds memory
const MAX_TEXT_CHARS = 20_000 // per-page readable-text cap fed downstream
const HEAD_HTML_CHARS = 20_000 // <head> slice kept for og/logo parse

// ── SSRF / scheme guard ────────────────────────────────────────────────────────────

/** Whether a url is a PUBLIC http(s) target safe to fetch. Blocks non-http schemes, localhost,
 *  and the obvious private / link-local / metadata ranges. The crawl seed is operator-supplied,
 *  so this is a guard against a pasted internal url pulling a private page into a demo. PURE. */
export function isFetchableUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  // URL keeps IPv6 hosts bracketed ("[::1]"); strip the brackets for the range checks below.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal')) {
    return false
  }
  // IPv4 private / loopback / link-local / metadata ranges.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10) return false
    if (a === 127) return false
    if (a === 0) return false
    if (a === 169 && b === 254) return false // link-local + AWS metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
  }
  // IPv6 loopback / unique-local / link-local.
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return false
  }
  return true
}

// ── HTML -> readable text (dependency-free) ──────────────────────────────────────────

/** Strip scripts/styles/tags from html to plain readable text, collapse whitespace, bound
 *  length. Dependency-free (no jsdom on the hot path). PURE + total. */
export function htmlToText(html: string, maxChars = MAX_TEXT_CHARS): string {
  const withoutScript = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const text = withoutScript
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

/** Pull the <title> text from html. PURE. */
export function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? htmlToText(m[1], 300) || undefined : undefined
}

/** The <head>…</head> slice (or a leading window) for og/logo parsing, length-bounded. PURE. */
export function extractHeadHtml(html: string): string {
  const m = html.match(/<head[\s\S]*?<\/head>/i)
  const head = m ? m[0] : html.slice(0, HEAD_HTML_CHARS)
  return head.slice(0, HEAD_HTML_CHARS)
}

// ── The default provider ────────────────────────────────────────────────────────────

/** Read the response body up to a byte cap (bounds memory on a hostile / huge page). */
async function readBounded(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return await res.text()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
      if (total >= maxBytes) {
        await reader.cancel()
        break
      }
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks))
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

/**
 * The default web provider. `fetchUrl` pulls a page over plain `fetch` (bounded, SSRF-guarded,
 * timeout-capped) and returns readable text + a head slice; `searchWeb` calls a pluggable search
 * API (Brave via `BRAVE_SEARCH_API_KEY`) and returns [] when no key is configured. Neither throws.
 */
export const defaultWebProvider: WebProvider = {
  async fetchUrl(url, opts) {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
    if (!isFetchableUrl(url)) {
      return { ok: false, url, status: 0, error: 'url is not a fetchable public http(s) target' }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'FrequencyImporter/1.0 (+https://hellofrequency.com)',
          accept: 'text/html,application/xhtml+xml',
        },
      })
      const contentType = res.headers.get('content-type') ?? undefined
      // Only parse html-ish bodies; a pdf / image / json page yields no readable text here.
      const isHtml = !contentType || /html|xml|text\//i.test(contentType)
      if (!res.ok) {
        return { ok: false, url, finalUrl: res.url, status: res.status, contentType, error: `http ${res.status}` }
      }
      if (!isHtml) {
        return { ok: true, url, finalUrl: res.url, status: res.status, contentType, text: '', headHtml: '' }
      }
      const body = await readBounded(res, maxBytes)
      return {
        ok: true,
        url,
        finalUrl: res.url,
        status: res.status,
        contentType,
        title: extractTitle(body),
        text: htmlToText(body),
        headHtml: extractHeadHtml(body),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = /abort/i.test(msg) ? 408 : 0
      return { ok: false, url, status, error: msg }
    } finally {
      clearTimeout(timer)
    }
  },

  async searchWeb(query, opts) {
    const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
    // No provider configured -> no results, never an error. The pipeline treats search as a
    // best-effort enrichment; paste + crawl still produce a draft (docs §7 honest limits).
    if (!key) return []
    const count = Math.min(opts?.count ?? 5, 10)
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const u = new URL('https://api.search.brave.com/res/v1/web/search')
      u.searchParams.set('q', query)
      u.searchParams.set('count', String(count))
      const res = await fetch(u, {
        headers: { accept: 'application/json', 'x-subscription-token': key },
        signal: controller.signal,
      })
      if (!res.ok) return []
      const json = (await res.json()) as {
        web?: { results?: { title?: string; url?: string; description?: string }[] }
      }
      return parseBraveResults(json)
    } catch {
      return []
    } finally {
      clearTimeout(timer)
    }
  },
}

/** Parse a Brave web-search payload into our WebSearchResult[]. Kept PURE + exported so the
 *  provider's shaping is unit-testable without a network call. */
export function parseBraveResults(json: {
  web?: { results?: { title?: string; url?: string; description?: string }[] }
}): WebSearchResult[] {
  const results = json.web?.results ?? []
  const out: WebSearchResult[] = []
  for (const r of results) {
    const url = (r.url ?? '').trim()
    if (!url) continue
    out.push({
      title: (r.title ?? '').trim(),
      url,
      snippet: htmlToText((r.description ?? '').trim(), 500),
    })
  }
  return out
}
