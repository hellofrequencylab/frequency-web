'use client'

// Client-side styled-PNG download (browser only). A managed code's PNG is rasterized HERE, on a
// canvas, from the self-contained styled SVG that /api/qr returns with `inline=1` (the avatar/logo
// embedded as a data URL, so the canvas never taints) — so the download always carries the full
// design without depending on the serverless resvg rasterizer. If any step fails, it falls back to
// the server-rendered PNG so a download never breaks. Shared by every member-facing code download.

/** Draw a (self-contained) SVG at `svgUrl` onto a canvas and export it as a transparent PNG Blob.
 *  Sized from the SVG's own intrinsic dimensions, falling back to `fallbackSize` square. */
function svgUrlToPngBlob(svgUrl: string, fallbackSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || fallbackSize
      const h = img.naturalHeight || fallbackSize
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png')
    }
    img.onerror = () => reject(new Error('svg image failed to load'))
    img.src = svgUrl
  })
}

/** Click a synthetic <a download> at `url`. Same-origin only, which every caller here is. */
function clickDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  clickDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download a managed code's design as a transparent PNG, rasterized on the client. `apiBase` is
 *  `/api/qr?code=<id>`; `name` is the bare filename (".png" appended). Best-effort: server PNG on
 *  failure. */
export async function downloadStyledQrPng(apiBase: string, name: string, size = 1024): Promise<void> {
  const safe = name.replace(/\.png$/i, '')
  try {
    const res = await fetch(`${apiBase}&format=svg&inline=1&transparent=1&size=${size}`)
    if (!res.ok) throw new Error('svg fetch failed')
    const blobUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      triggerDownload(await svgUrlToPngBlob(blobUrl, size), `${safe}.png`)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  } catch {
    // FALL BACK TO THE SERVER-RENDERED PNG VIA AN <a download>, NOT `window.location.href`.
    // This is a file fetch, not a navigation, so the lint rule that flagged the old line
    // (@next/next/no-location-assign-relative-destination) was right to flag it and wrong in its
    // remedy: `router.push()` at an /api route client-navigates, and downloads nothing. An anchor
    // is what this always wanted. It is also strictly safer — assigning `location` unloads the
    // page and depends on the server setting Content-Disposition to bring the member back, so a
    // missing header would have dropped them on a raw PNG instead of on the code they were
    // downloading. The `download` attribute names the file same-origin whatever the header says.
    clickDownload(`${apiBase}&format=png&download=${encodeURIComponent(safe)}`, `${safe}.png`)
  }
}

// ── In-memory styled-SVG downloads (the share dialogs' QR) ─────────────────────────────────────
// The share buttons render their QR from an SVG STRING (renderStyledQrSvg), not a managed /api/qr
// code, so their downloads inline the logo here: an SVG loaded as an <img> (for the PNG raster)
// never fetches external resources, and a downloaded .svg opened elsewhere could not resolve a
// root-relative logo path. Inlining as a data URL makes both self-contained.

/** Fetch a same-origin image URL and return it as a data URL (null on any failure). */
async function toDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** A copy of `style` with its logo inlined as a data URL (self-contained SVG). A failed fetch
 *  drops the logo rather than shipping a broken reference. */
export async function inlineQrStyleLogo<T extends { logo: string | null }>(style: T): Promise<T> {
  if (!style.logo || style.logo.startsWith('data:')) return style
  return { ...style, logo: await toDataUrl(style.logo) }
}

/** Download an in-memory (self-contained) SVG string as a .svg file. */
export function downloadQrSvgString(svg: string, name: string): void {
  const safe = name.replace(/\.svg$/i, '')
  triggerDownload(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safe}.svg`)
}

/** Rasterize an in-memory (self-contained) SVG string to a PNG and download it. */
export async function downloadQrSvgStringAsPng(svg: string, name: string, size = 1024): Promise<void> {
  const safe = name.replace(/\.png$/i, '')
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    triggerDownload(await svgUrlToPngBlob(blobUrl, size), `${safe}.png`)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
