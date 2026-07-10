// Spotlight media embeds — the MySpace "profile song" + Discord-style rich media, done
// SAFELY. The hard rule (this is why embeds were deferred): a member NEVER supplies an
// iframe `src`. They paste a normal share URL; we parse it against a CLOSED host allowlist,
// extract a strict id/ref, and the renderer RECONSTRUCTS a known-safe embed URL from that
// validated ref + the provider's fixed template. A tampered `meta` can at worst carry a ref
// that fails the per-provider pattern (dropped) — there is no path to an arbitrary iframe.
//
// Pure (no IO/React), shared by the editor (parse a paste), the validator (read-side
// authority), and the renderer (build the src). Add a provider = add it in all three maps
// here, nowhere else.

export type EmbedProvider = 'youtube' | 'spotify' | 'soundcloud' | 'vimeo'

export const EMBED_PROVIDERS: { id: EmbedProvider; label: string; hint: string }[] = [
  { id: 'spotify', label: 'Spotify', hint: 'Paste a track, album, playlist, or artist link' },
  { id: 'youtube', label: 'YouTube', hint: 'Paste a video, playlist, or channel link' },
  { id: 'soundcloud', label: 'SoundCloud', hint: 'Paste a track or playlist link' },
  { id: 'vimeo', label: 'Vimeo', hint: 'Paste a video link' },
]

// Per-provider strict ref patterns. The ref is the ONLY member-derived part of the src,
// so each pattern is tight enough that the reconstructed URL is always well-formed.
const YT_ID = /^[A-Za-z0-9_-]{11}$/
// A YouTube PLAYLIST (or a channel's uploads playlist), stored as `list/<id>` so it is unambiguous
// against an 11-char video id. Playlist ids are 12-42 url-safe chars (e.g. PL…, UU… uploads).
const YT_PLAYLIST = /^list\/[A-Za-z0-9_-]{12,42}$/
const VIMEO_ID = /^[0-9]{6,12}$/
// Spotify collections include `artist` (a whole profile) alongside the single-item refs.
const SPOTIFY_REF = /^(track|album|playlist|episode|show|artist)\/[A-Za-z0-9]{22}$/

/** Validate a stored `(provider, ref)` — returns the safe ref, or null to drop the block.
 *  This is the read-side authority: it runs on every public render via the validator. */
export function validateEmbedRef(provider: unknown, ref: unknown): { provider: EmbedProvider; ref: string } | null {
  if (typeof ref !== 'string') return null
  switch (provider) {
    case 'youtube':
      return YT_ID.test(ref) || YT_PLAYLIST.test(ref) ? { provider, ref } : null
    case 'vimeo':
      return VIMEO_ID.test(ref) ? { provider, ref } : null
    case 'spotify':
      return SPOTIFY_REF.test(ref) ? { provider, ref } : null
    case 'soundcloud': {
      // ref is the canonical https track URL; the host must be soundcloud.
      try {
        const u = new URL(ref)
        const ok = u.protocol === 'https:' && /(^|\.)soundcloud\.com$/.test(u.hostname)
        return ok ? { provider, ref: u.toString() } : null
      } catch { return null }
    }
    default:
      return null
  }
}

/** Build the safe iframe `src` from a VALIDATED `(provider, ref)`. Never call with unvalidated
 *  input — pass the output of validateEmbedRef / parseEmbedUrl. */
export function buildEmbedSrc(provider: EmbedProvider, ref: string): string {
  switch (provider) {
    case 'youtube':
      // A `list/<id>` ref embeds the whole playlist (or a channel's uploads) via the videoseries player.
      return ref.startsWith('list/')
        ? `https://www.youtube.com/embed/videoseries?list=${ref.slice(5)}`
        : `https://www.youtube.com/embed/${ref}`
    case 'vimeo': return `https://player.vimeo.com/video/${ref}`
    case 'spotify': return `https://open.spotify.com/embed/${ref}`
    case 'soundcloud':
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(ref)}&color=%23ff5500&auto_play=false&visual=true`
  }
}

/** Suggested iframe height (px) — video is 16:9-ish; a single music track is a compact bar, while a
 *  Spotify collection (album / playlist / artist / show) is a taller scrollable list. */
export function embedHeight(provider: EmbedProvider, ref?: string): number {
  if (provider === 'youtube' || provider === 'vimeo') return 240
  if (provider === 'spotify' && ref && /^(album|playlist|artist|show)\//.test(ref)) return 352
  return 152
}

/** Parse a pasted share URL into `(provider, ref)`, or null if it matches no allowed host.
 *  Editor convenience — the result is still re-checked by validateEmbedRef on save + read. */
export function parseEmbedUrl(raw: unknown): { provider: EmbedProvider; ref: string } | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()

  // spotify: URI form `spotify:track:<id>`
  const uri = s.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{22})$/)
  if (uri) return validateEmbedRef('spotify', `${uri[1]}/${uri[2]}`)

  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname

  // YouTube
  if (host === 'youtu.be') return validateEmbedRef('youtube', path.slice(1))
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v')
    if (v) return validateEmbedRef('youtube', v) // a single video wins even when a list rides along
    // A channel link → embed the channel's uploads playlist (UC<id> → UU<id>), the closest thing to an
    // "embed this account". Only the canonical /channel/UC… form is derivable without an API call.
    const ch = path.match(/^\/channel\/UC([A-Za-z0-9_-]{22})$/)
    if (ch) return validateEmbedRef('youtube', `list/UU${ch[1]}`)
    // A playlist link (?list=…).
    const list = u.searchParams.get('list')
    if (list) return validateEmbedRef('youtube', `list/${list}`)
    const m = path.match(/^\/(embed|shorts|v)\/([^/?#]+)/)
    if (m) return validateEmbedRef('youtube', m[2])
    return null
  }
  // Vimeo
  if (host === 'vimeo.com') {
    const m = path.match(/(\d{6,12})/)
    return m ? validateEmbedRef('vimeo', m[1]) : null
  }
  if (host === 'player.vimeo.com') {
    const m = path.match(/\/video\/(\d{6,12})/)
    return m ? validateEmbedRef('vimeo', m[1]) : null
  }
  // Spotify
  if (host === 'open.spotify.com') {
    const m = path.match(/^\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})/)
    return m ? validateEmbedRef('spotify', `${m[1]}/${m[2]}`) : null
  }
  // SoundCloud — keep the canonical track URL (host-pinned).
  if (/(^|\.)soundcloud\.com$/.test(u.hostname) && path.length > 1) {
    return validateEmbedRef('soundcloud', `https://soundcloud.com${path}`)
  }
  return null
}

// ── LINK-CARD providers (no safe iframe player exists) ──────────────────────────────────────────────
// Some services have no public embeddable player — their media plays in their own app — so we surface a
// rich LINK-OUT card instead of an iframe. A card is an `<a>`, never a frame, so it needs no CSP
// `frame-src` host and carries no embed risk. Insight Timer tracks/teachers play in the Insight Timer
// app; this renders a tasteful "Listen on Insight Timer" card. Add a host = add a row here.

export type LinkCardProvider = 'insighttimer'

const LINK_CARD_HOSTS: { match: RegExp; provider: LinkCardProvider; label: string }[] = [
  { match: /(^|\.)insighttimer\.com$/, provider: 'insighttimer', label: 'Insight Timer' },
]

/** Parse a pasted URL into a LINK-CARD `(provider, url, label)`, or null. Only https, host-allowlisted;
 *  the returned url is the canonical href for an `<a>` (no iframe is ever built from it). */
export function parseLinkCard(raw: unknown): { provider: LinkCardProvider; url: string; label: string } | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  for (const c of LINK_CARD_HOSTS) if (c.match.test(u.hostname)) return { provider: c.provider, url: u.toString(), label: c.label }
  return null
}
