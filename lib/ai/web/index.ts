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

/** Whether an IPv4-literal host is in a private / loopback / link-local / CGNAT / metadata range.
 *  Parses the four octets from a FULLY-ANCHORED dotted-quad and range-checks numerically (never a
 *  substring match). Returns false for a non-IPv4 host (the caller applies the other checks). PURE. */
export function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const oct = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (oct.some((n) => n > 255)) return false // not a valid IPv4 literal; let host rules handle it
  const [a, b] = oct
  if (a === 0) return true //                       0.0.0.0/8 ("this network", incl 0.0.0.0)
  if (a === 10) return true //                      10.0.0.0/8
  if (a === 127) return true //                     127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true //        169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true //        192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  return false
}

/** Whether an IPv6-literal host (brackets already stripped) is loopback / unique-local / link-local.
 *  Matches the range prefixes on the FULLY-NORMALIZED lowercase literal, anchored. Also decodes an
 *  IPv4-mapped address (`::ffff:*`, in either dotted or `new URL()`-normalized hex form) and blocks it
 *  when the embedded IPv4 is private. PURE. */
export function isPrivateIpv6(host: string): boolean {
  if (host === '::1' || host === '::') return true //          loopback / unspecified
  // fc00::/7 (unique-local) = first hextet fc.. or fd.. ; fe80::/10 (link-local) = fe8/fe9/fea/feb..
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true //        fc00::/7
  if (/^fe[89ab][0-9a-f]?:/.test(host)) return true //         fe80::/10
  // IPv4-mapped: dotted form ::ffff:127.0.0.1
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host)
  if (dotted && isPrivateIpv4(dotted[1])) return true
  // IPv4-mapped: hex form ::ffff:7f00:1 (how new URL() normalizes ::ffff:127.0.0.1). Decode the two
  // trailing hextets into a dotted quad and range-check it.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
    if (isPrivateIpv4(ipv4)) return true
  }
  return false
}

/**
 * Whether a url is a PUBLIC http(s) target safe to fetch. The crawl seed is USER-supplied, so this is
 * the SSRF guard: it parses the REAL host with `new URL()` (never a loose hostname regex that
 * `example.com.attacker.com` could slip past) and blocks non-http(s) schemes, `localhost`, the
 * `.internal` / `.local` suffixes, and every private / loopback / link-local / CGNAT / metadata IP
 * range (IPv4 and IPv6). Any host regex used below is fully anchored with escaped dots. PURE.
 */
export function isFetchableUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  // `new URL().hostname` is the parsed authority host (IPv6 stays bracketed); lowercase + de-bracket.
  const host = u.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!host) return false
  if (host === 'localhost') return false
  // Fully-anchored suffix checks (escaped dot) so only a real trailing label matches.
  if (/\.local$/.test(host) || /\.internal$/.test(host) || /\.localhost$/.test(host)) return false
  if (isPrivateIpv4(host)) return false
  if (host.includes(':') && isPrivateIpv6(host)) return false
  return true
}

// ── HTML -> readable text (dependency-free) ──────────────────────────────────────────

/** Apply a replacement repeatedly until the string stops changing (or a small iteration bound is
 *  hit). A single regex pass over html can be evaded by nested/overlapping tags (e.g.
 *  `<scr<script>ipt>` collapses back into `<script>` after one pass), so tag/element removal must
 *  loop to a fixed point. Bounded to avoid an unbounded loop on pathological input. PURE. */
function replaceUntilStable(input: string, re: RegExp, replacement: string, maxPasses = 20): string {
  let out = input
  for (let i = 0; i < maxPasses; i++) {
    const next = out.replace(re, replacement)
    if (next === out) return next
    out = next
  }
  return out
}

/**
 * Strip scripts/styles/tags from html to plain readable text, collapse whitespace, bound length.
 * Dependency-free (no jsdom on the hot path). The tag-bearing removals LOOP to a fixed point so
 * nested / overlapping tags cannot reassemble into a surviving tag after one pass. The regexes are
 * ReDoS-safe: each `<[^>]*>`-style body is a negated character class (linear, no nested quantifier
 * that could backtrack catastrophically). Output feeds the LLM, not a DOM, so the goal is complete
 * stripping without ReDoS, not HTML-spec-perfect parsing. PURE + total.
 */
export function htmlToText(html: string, maxChars = MAX_TEXT_CHARS): string {
  // Remove whole script/style/noscript elements + comments, looping to a fixed point.
  let stripped = html
  stripped = replaceUntilStable(stripped, /<script\b[^>]*>[^<]*(?:<(?!\/script>)[^<]*)*<\/script\s*>/gi, ' ')
  stripped = replaceUntilStable(stripped, /<style\b[^>]*>[^<]*(?:<(?!\/style>)[^<]*)*<\/style\s*>/gi, ' ')
  stripped = replaceUntilStable(stripped, /<noscript\b[^>]*>[^<]*(?:<(?!\/noscript>)[^<]*)*<\/noscript\s*>/gi, ' ')
  stripped = replaceUntilStable(stripped, /<!--[^-]*(?:-(?!->)[^-]*)*-->/g, ' ')
  // Turn a few block-closers into newlines, then remove ALL remaining tags, looping to a fixed point
  // so `<scr<script>ipt>`-style nesting cannot rebuild a tag.
  stripped = stripped.replace(/<(br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
  stripped = replaceUntilStable(stripped, /<[^<>]*>/g, ' ')
  // Any leftover lone angle brackets (from malformed / truncated markup) are neutralized.
  stripped = stripped.replace(/[<>]/g, ' ')
  const text = stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n')
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
