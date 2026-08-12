// The HEIC decoder's CLIENT-ONLY BOUNDARY (ADR-1002 follow-up, docs/DEPLOY-SAFETY.md rule 2).
//
// 🔴 WHAT THIS COSTS WHEN IT IS NOT BOUNDED. `heic2any` is libheif compiled to wasm, ~1.3MB, and it
// can only ever run in a browser: it needs the File the person just picked. It was nonetheless in
// 381 serverless functions. lib/library/image-shrink.ts is imported by two dozen uploaders spread
// right across the app, Next server-renders every one of those client components, and @vercel/nft
// reads the `import('heic2any')` specifier out of the emitted SSR chunk whether or not that branch
// could ever execute there. Measured: 1.29MB x 381 functions = 491MB.
//
// ⚠️ A COMMENT IS NOT A MECHANISM (DEPLOY-SAFETY rule 7). `turbopackIgnore` does nothing here — nft
// reads the literal specifier regardless — and hiding the name behind a computed string only breaks
// the bundle, because Turbopack resolves dynamic imports at build time. Two real things do the work:
//
//   1. THIS FILE is the one module in the repo allowed to name `heic2any`, reached by a single
//      dynamic import from image-shrink. That gives the decoder exactly one door, and makes the
//      emitted chunk carry heic2any and nothing else.
//   2. next.config.ts `outputFileTracingExcludes` drops that one chunk from the server traces. It
//      is safe for the same reason `public/tracks/**` is: no server code path can reach it. The
//      only caller is `heicToJpegBlob`, which runs from an upload handler, on a File, after
//      `createImageBitmap` has already been tried — none of which exists during a server render.
//
// The exclude is keyed on the chunk NAME containing "heic2any", so the bare literal specifier below
// is load-bearing. scripts/build-fanout.test.ts fails if a second importer appears, if the exclude
// goes missing, or if the measured fan-out creeps back: an exclude that silently stops matching is
// exactly the invisible regression DEPLOY-SAFETY rule 6 is about.

/**
 * Decode a HEIC/HEIF blob and re-encode it as JPEG, or null when it genuinely cannot be read.
 * BROWSER ONLY. FAIL-SAFE: any failure returns null so the caller can show its own message rather
 * than throwing out of an upload handler.
 */
export async function decodeHeicToJpeg(blob: Blob, quality: number): Promise<Blob | null> {
  try {
    const { default: heic2any } = await import('heic2any')
    const out = await heic2any({ blob, toType: 'image/jpeg', quality })
    const jpeg = Array.isArray(out) ? out[0] : out
    return jpeg && jpeg.size > 0 ? jpeg : null
  } catch {
    return null
  }
}
