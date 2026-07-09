// Fetch a REMOTE, public image (a Supabase-hosted Space cover / logo) for a Satori OG render and
// return it as a base64 data URI. Satori cannot reliably load a bare remote `src`, so callers inline
// the bytes — the same way the root OG image inlines its local hero.jpg. FAIL-SAFE: returns null on
// ANY problem — a non-2xx response, a non-image content type, an oversized body (Satori's practical
// payload budget), or a slow origin (bounded by the timeout) — so a broken or huge upload can never
// crash or hang a crawler's card fetch; the caller falls back to its local placeholder.

const MAX_BYTES = 6 * 1024 * 1024
const TIMEOUT_MS = 3500

export async function fetchRemoteImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null
    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`
  } catch {
    return null
  }
}
