// Client-side file export for Loom assets. Code-drawn elements render with DAWN token
// classes (fill-primary, stroke-signal, …) that only resolve against the app's CSS, so to
// export a standalone file we read the COMPUTED colors off the live DOM and inline them.
// That yields a self-contained SVG (and, rasterized, a PNG) that opens correctly anywhere.
// Photo/image assets download by fetching the URL as a blob. All functions run in the browser.

const PRESENTATION_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'fill-rule',
  'opacity',
] as const

/** Clone an on-DOM SVG and bake each element's computed presentation styles inline,
 *  dropping the (app-only) utility classes so the result stands alone. */
function inlineSvgStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement
  const srcEls = [source, ...Array.from(source.querySelectorAll<SVGElement>('*'))]
  const clnEls = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))]
  for (let i = 0; i < srcEls.length && i < clnEls.length; i++) {
    const cs = getComputedStyle(srcEls[i])
    const el = clnEls[i]
    for (const prop of PRESENTATION_PROPS) {
      const v = cs.getPropertyValue(prop)
      if (v) el.setAttribute(prop, v)
    }
    el.removeAttribute('class')
  }
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return clone
}

function serialize(svg: SVGSVGElement): string {
  const s = new XMLSerializer().serializeToString(svg)
  return s.startsWith('<?xml') ? s : `<?xml version="1.0" encoding="UTF-8"?>\n${s}`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Download an on-DOM element illustration as a self-contained .svg. */
export function downloadElementSvg(source: SVGSVGElement, filename: string): void {
  const str = serialize(inlineSvgStyles(source))
  triggerDownload(new Blob([str], { type: 'image/svg+xml' }), filename)
}

/** Rasterize an on-DOM element illustration to a .png at `width` px (keeps aspect). */
export async function downloadElementPng(source: SVGSVGElement, filename: string, width = 960): Promise<void> {
  const clone = inlineSvgStyles(source)
  const vb = source.viewBox?.baseVal
  const ratio = vb && vb.width ? vb.height / vb.width : 150 / 240
  const w = width
  const h = Math.round(width * ratio)
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialize(clone))

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, filename)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Could not rasterize the SVG'))
    img.src = dataUrl
  })
}

/** Rasterize an on-DOM element to a PNG and return the base64 payload (no data-URL prefix),
 *  on a white field — for sending to Vera's vision review so she can SEE her own work. */
export async function rasterizeSvgElement(source: SVGSVGElement, width = 512): Promise<string> {
  const clone = inlineSvgStyles(source)
  const vb = source.viewBox?.baseVal
  const ratio = vb && vb.width ? vb.height / vb.width : 150 / 240
  const w = width
  const h = Math.max(1, Math.round(width * ratio))
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialize(clone))

  return await new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const url = canvas.toDataURL('image/png')
      resolve(url.split(',')[1] ?? '')
    }
    img.onerror = () => reject(new Error('Could not rasterize the SVG'))
    img.src = dataUrl
  })
}

/** Rasterize a self-contained SVG STRING (explicit colors, no app CSS) to a PNG, returning the
 *  base64 payload (no data-URL prefix). Transparent field by default. Used by the badge composer,
 *  whose SVG already carries hex fills, so no style-inlining is needed. */
export async function rasterizeSvgString(svg: string, size = 512, background?: string): Promise<string> {
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  return await new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      if (background) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, size, size)
      }
      // Contain the (400×440) badge within the square, centered.
      const iw = img.width || 400
      const ih = img.height || 440
      const scale = Math.min(size / iw, size / ih)
      const w = iw * scale
      const h = ih * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/png').split(',')[1] ?? '')
    }
    img.onerror = () => reject(new Error('Could not rasterize the SVG'))
    img.src = dataUrl
  })
}

/** Download a file-backed asset by URL. Falls back to opening it if the fetch is blocked. */
export async function downloadImageUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    triggerDownload(await res.blob(), filename)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/** Best-effort file extension from a mime type. */
export function extForMime(mime: string | null): string {
  if (!mime) return 'img'
  const m: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
  }
  return m[mime] ?? mime.split('/').pop() ?? 'img'
}
