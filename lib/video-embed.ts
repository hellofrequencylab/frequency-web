// Turn the first video link found in a block of text into an embeddable source
// (docs/JOURNEYS.md §5A, ADR-244). The lesson editor invites authors to "paste a
// video link", so a lesson body that carries a YouTube / Vimeo / direct-file URL
// renders as an inline player in the course. Pure + unit-tested: no IO, no React.

export type VideoProvider = 'youtube' | 'vimeo' | 'file'

export interface VideoEmbed {
  provider: VideoProvider
  /** The original URL as written, so callers can de-dupe a body that is only the link. */
  url: string
  /** youtube/vimeo: an iframe src. file: the direct media URL for a <video> element. */
  src: string
}

/** The first bare http(s) URL in the text (trailing sentence punctuation trimmed off). */
const URL_RE = /https?:\/\/[^\s<>"')]+/i

/** Parse the first embeddable video URL out of `text`, or null if there isn't one.
 *  Recognizes YouTube (watch / youtu.be / embed / shorts), Vimeo (vimeo.com /
 *  player.vimeo.com), and direct media files (.mp4/.webm/.ogg/.mov/.m4v). */
export function parseVideoEmbed(text: string | null | undefined): VideoEmbed | null {
  if (!text) return null
  const match = text.match(URL_RE)
  if (!match) return null
  const url = match[0].replace(/[.,);!?]+$/, '') // strip trailing sentence punctuation

  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  const segments = u.pathname.split('/').filter(Boolean)

  // ── YouTube ──
  if (host === 'youtu.be') {
    const id = segments[0]
    if (id) return { provider: 'youtube', url, src: `https://www.youtube.com/embed/${id}` }
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      u.searchParams.get('v') ??
      (segments[0] === 'embed' || segments[0] === 'shorts' ? segments[1] : null)
    if (id) return { provider: 'youtube', url, src: `https://www.youtube.com/embed/${id}` }
  }

  // ── Vimeo ── (vimeo.com/123, player.vimeo.com/video/123)
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = segments[segments.length - 1]
    if (id && /^\d+$/.test(id)) return { provider: 'vimeo', url, src: `https://player.vimeo.com/video/${id}` }
  }

  // ── Direct media file ──
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(u.pathname)) {
    return { provider: 'file', url, src: url }
  }

  return null
}
