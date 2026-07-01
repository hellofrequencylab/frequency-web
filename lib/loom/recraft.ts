import 'server-only'

// Recraft API client — The Loom's managed image/vector engine (docs/RESEARCH-ASSET-GEN.md). Recraft
// is the pragmatic managed pick for consistent VECTOR icon sets + brand styles + instruction SVG
// editing, and also does raster (trophies/rewards). Runs server-side only (Vercel egress is open);
// gated on RECRAFT_API_KEY so the feature is inert until a key is configured. All calls are
// best-effort with a typed result; callers gate access + budget.
//
// API: https://www.recraft.ai/docs — base https://external.api.recraft.ai/v1, Bearer auth.

const BASE = 'https://external.api.recraft.ai/v1'

/** Whether a Recraft key is configured (the whole feature hides when false). */
export function recraftConfigured(): boolean {
  return !!process.env.RECRAFT_API_KEY
}

function key(): string {
  const k = process.env.RECRAFT_API_KEY
  if (!k) throw new Error('RECRAFT_API_KEY is not set')
  return k
}

export type RecraftLane = 'vector' | 'raster'
export type RecraftImage = { url: string; isSvg: boolean }

/** Wrap bytes as a Blob for multipart upload. Copies into a fresh ArrayBuffer so the part type is
 *  a plain ArrayBuffer (a bare Uint8Array's buffer can be typed as SharedArrayBuffer). */
function fileBlob(bytes: Uint8Array): Blob {
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new Blob([buf])
}

/** Recraft styles per lane. Vector → clean SVG icon/illustration; raster → warm flat digital art.
 *  A `styleId` (a brand style trained from reference images) overrides the base style for set
 *  consistency. */
const LANE_STYLE: Record<RecraftLane, string> = {
  vector: 'vector_illustration',
  raster: 'digital_illustration',
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Recraft ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as T
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Recraft ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as T
}

type GenResponse = { data?: Array<{ url?: string; image_id?: string }> }
type ImageResponse = { image?: { url?: string } }

/** Fetch a Recraft result URL and return its bytes + content type. */
export async function downloadRecraft(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Recraft download ${res.status}`)
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType }
}

/** Generate one or more images. Vector lane returns SVG-capable results; raster returns PNG. */
export async function generateImages(input: {
  prompt: string
  lane: RecraftLane
  size?: string
  styleId?: string
  n?: number
}): Promise<RecraftImage[]> {
  const body: Record<string, unknown> = {
    prompt: input.prompt.slice(0, 1000),
    model: 'recraftv3',
    size: input.size ?? '1024x1024',
    n: Math.min(Math.max(input.n ?? 1, 1), 6),
  }
  if (input.styleId) body.style_id = input.styleId
  else body.style = LANE_STYLE[input.lane]

  const res = await postJson<GenResponse>('/images/generations', body)
  return (res.data ?? [])
    .map((d) => d.url)
    .filter((u): u is string => !!u)
    .map((url) => ({ url, isSvg: input.lane === 'vector' || url.toLowerCase().includes('.svg') }))
}

/** Trace a raster image to a clean SVG. Returns the SVG result URL. */
export async function vectorizeImage(bytes: Uint8Array, filename = 'image.png'): Promise<string> {
  const form = new FormData()
  form.append('file', fileBlob(bytes), filename)
  const res = await postForm<ImageResponse>('/images/vectorize', form)
  if (!res.image?.url) throw new Error('Recraft vectorize: no url')
  return res.image.url
}

/** Instruction-style raster edit (image + prompt → a modified image). */
export async function imageToImage(input: {
  bytes: Uint8Array
  prompt: string
  strength?: number
  lane?: RecraftLane
  filename?: string
}): Promise<string> {
  const form = new FormData()
  form.append('image', fileBlob(input.bytes), input.filename ?? 'image.png')
  form.append('prompt', input.prompt.slice(0, 1000))
  form.append('strength', String(input.strength ?? 0.3))
  form.append('style', LANE_STYLE[input.lane ?? 'raster'])
  const res = await postForm<GenResponse>('/images/imageToImage', form)
  const url = res.data?.[0]?.url
  if (!url) throw new Error('Recraft imageToImage: no url')
  return url
}

/** Remove an image's background. Returns the result URL. */
export async function removeBackground(bytes: Uint8Array, filename = 'image.png'): Promise<string> {
  const form = new FormData()
  form.append('file', fileBlob(bytes), filename)
  const res = await postForm<ImageResponse>('/images/removeBackground', form)
  if (!res.image?.url) throw new Error('Recraft removeBackground: no url')
  return res.image.url
}

/** Create a reusable brand STYLE from reference images (the key to consistent sets). Returns its id. */
export async function createStyle(base: RecraftLane, refs: Uint8Array[]): Promise<string> {
  const form = new FormData()
  form.append('style', LANE_STYLE[base])
  refs.slice(0, 5).forEach((b, i) => form.append('file', fileBlob(b), `ref-${i}.png`))
  const res = await postForm<{ id?: string }>('/styles', form)
  if (!res.id) throw new Error('Recraft createStyle: no id')
  return res.id
}
