// The member's "Website" field, made safe to render as a link (L9-02, 2026-09-05).
//
// Settings > Profile saves whatever the member typed into `profiles.website` (trimmed, capped at
// 200 characters, otherwise unchecked), and until L9-02 nothing rendered it. The public profile
// now shows it on the facts line, which makes this the ONE place the raw value is turned into an
// href, so the rules live here and are tested here:
//   • only http(s) renders. A `javascript:` or `data:` value is a stored XSS vector in an <a href>,
//     a `mailto:`/`ftp:` one is not a website; all of them read as "no website".
//   • a bare domain ("example.com", "www.example.com/about") is what people type, so a value with
//     no scheme is read as https. A scheme-relative "//host" is NOT (it would inherit the page's
//     origin rules and is never what a member meant).
//   • credentials in the URL ("http://user:pass@host") are refused outright.
//   • the host must look like a host (at least one dot), so "localhost" and stray words never
//     become a link.
// The label is the hostname without a leading "www.", so the line reads "example.com" rather than
// the full path the member pasted. PURE: no React, no Next, no Supabase.

export type SafeWebsite = { href: string; label: string }

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function safeWebsite(raw: string | null | undefined): SafeWebsite | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('//')) return null

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!url.hostname.includes('.')) return null

  return { href: url.href, label: url.hostname.replace(/^www\./, '') }
}
