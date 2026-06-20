// SPLASH PAGE RENDERER for the /q/<slug> resolver (ENTITY-SPACES-BUILD §C, Phase 2). Produces a
// self-contained HTML string for a code's splash landing, when the splash has no primary CTA to
// redirect to (the resolver handles the redirect case itself). This is a PUBLIC, unauthenticated
// route-handler response OUTSIDE the React app shell, so it cannot reach the DAWN CSS tokens; it
// mirrors the established standalone-HTML pattern for public /q and /u/scan responses (inline styles,
// escaped content) rather than composing kit components (which only exist inside the rendered app).
//
// SAFETY: every value the owner typed (heading, blurb, link labels) is HTML-escaped before it lands
// in the markup, and the splash is already normalized by lib/qr/splash.ts before it reaches here
// (links validated, image url restricted to http(s)/same-origin), so there is no script-injection or
// open-data-URI surface. A link url resolves against the request origin (relative paths work).
//
// VOICE: the only fixed copy here is the small Frequency footer line; everything else is the owner's
// own words. Plain, no narrated feelings, no em/en dashes (CONTENT-VOICE §10). PURE: a Splash + origin
// in, an HTML string out (no IO), so it unit-tests cleanly alongside splash.ts.

import type { Splash } from './splash'

/** HTML-escape a string for safe interpolation into element text + attribute values. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Resolve a splash link/image url against the request origin so a site-relative path ('/spaces/x')
 *  works the same as an absolute one. Falls back to the raw (already-validated) value on any parse
 *  error. */
function resolveUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin).toString()
  } catch {
    return url
  }
}

/** Render a splash to a self-contained HTML page string. `origin` resolves relative link/image urls.
 *  The first link is styled as the primary button; the rest as secondary links. */
export function renderSplashPage(splash: Splash, origin: string): string {
  const heading = escapeHtml(splash.heading)
  const blurb = splash.blurb ? escapeHtml(splash.blurb) : ''

  const image = splash.imageUrl
    ? `<img src="${escapeHtml(resolveUrl(splash.imageUrl, origin))}" alt="" ` +
      `style="display:block;width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin:0 0 20px;">`
    : ''

  const links = splash.links
    .map((l, i) => {
      const href = escapeHtml(resolveUrl(l.url, origin))
      const label = escapeHtml(l.label)
      const primary =
        'display:block;text-align:center;text-decoration:none;background:#1a1a1a;color:#fff;' +
        'font-weight:600;padding:14px 20px;border-radius:10px;margin:0 0 10px;'
      const secondary =
        'display:block;text-align:center;text-decoration:none;background:#f0f0f0;color:#1a1a1a;' +
        'font-weight:600;padding:14px 20px;border-radius:10px;margin:0 0 10px;'
      return `<a href="${href}" style="${i === 0 ? primary : secondary}">${label}</a>`
    })
    .join('')

  const blurbHtml = blurb
    ? `<p style="color:#555;line-height:1.6;margin:0 0 20px;font-size:16px;">${blurb}</p>`
    : ''

  const inner =
    image +
    `<h1 style="font-size:24px;line-height:1.3;margin:0 0 12px;color:#1a1a1a;">${heading}</h1>` +
    blurbHtml +
    (links ? `<div style="margin-top:8px;">${links}</div>` : '')

  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${heading}</title></head>` +
    `<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;` +
    `background:#f5f5f5;margin:0;padding:48px 16px;color:#1a1a1a;">` +
    `<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">` +
    inner +
    `<p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center;">Made with Frequency</p>` +
    `</div></body></html>`
  )
}
