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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
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
    window.location.href = `${apiBase}&format=png&download=${encodeURIComponent(safe)}`
  }
}
