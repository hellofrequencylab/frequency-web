import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// ── The Stage share-card faces: Unbounded, Hanken Grotesk, Instrument Serif italic ───────────
//
// The three families the design system names (design_handoff/frequency/tokens/typography.css),
// committed as STATIC TrueType instances under public/fonts/stage/ and read from disk, never
// fetched. Satori parses TrueType, OpenType and WOFF but not WOFF2, and it draws a variable font at
// its default instance only, so the app's own woff2 files cannot be handed to it: each face
// here was cut from those files at one weight with fontTools' instancer (Unbounded 700, Hanken
// Grotesk 500 and 700) and saved as plain TTF. Instrument Serif has no weight axis.
//
// ⚠️ ONE LITERAL PATH PER FACE, AND IT HAS TO STAY THAT WAY. Same rule as load-nunito.ts, for the same
// reason: @vercel/nft cannot resolve a path built from a variable, so a shared `read(name)` helper
// globs the whole directory into every function that reaches this module. The four reads below are
// written out so the tracer resolves each exactly. `stage-fonts.test.ts` fails on a helper.
//
// Nunito Bold rides along as the LAST family in every `fontFamily` stack. These faces are Latin
// subsets, so a name in a script they lack would otherwise render as tofu; Satori falls back per
// glyph across the families it was handed.

const readUnboundedBold = () => readFile(join(process.cwd(), 'public/fonts/stage', 'Unbounded-Bold.ttf'))
const readHankenMedium = () => readFile(join(process.cwd(), 'public/fonts/stage', 'HankenGrotesk-Medium.ttf'))
const readHankenBold = () => readFile(join(process.cwd(), 'public/fonts/stage', 'HankenGrotesk-Bold.ttf'))
// The glyph fallback is read here, by its own literal path, rather than through load-nunito.ts: that module
// also names Nunito Black and LiberationSans, and importing it would carry both into every card function for
// faces this layout never draws (check:build-fanout counts public/ files per function).
const readNunitoFallback = () => readFile(join(process.cwd(), 'public/fonts', 'Nunito-Bold.ttf'))
const readInstrumentItalic = () => readFile(join(process.cwd(), 'public/fonts/stage', 'InstrumentSerif-Italic.ttf'))

/** Detach the exact bytes: `readFile` returns a view into a shared pool slab. */
function detach(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

type StageFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: 'normal' | 'italic' }

/** Resolved bytes only, never a rejected promise, so a transient read failure is retried next card. */
let cached: StageFont[] | null = null
let inflight: Promise<StageFont[]> | null = null

export const STAGE_DISPLAY = 'Unbounded, Nunito'
export const STAGE_SANS = 'Hanken Grotesk, Nunito'
export const STAGE_SERIF = 'Instrument Serif, Nunito'

/** Every face a Stage card draws with, in one array ready for `ImageResponse({ fonts })`. */
export async function loadStageFonts(): Promise<StageFont[]> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = Promise.all([
    readUnboundedBold(),
    readHankenMedium(),
    readHankenBold(),
    readInstrumentItalic(),
    readNunitoFallback(),
  ])
    .then(([unbounded, medium, bold, italic, nunito]) => {
      cached = [
        { name: 'Unbounded', data: detach(unbounded), weight: 700, style: 'normal' },
        { name: 'Hanken Grotesk', data: detach(medium), weight: 500, style: 'normal' },
        { name: 'Hanken Grotesk', data: detach(bold), weight: 700, style: 'normal' },
        { name: 'Instrument Serif', data: detach(italic), weight: 400, style: 'italic' },
        { name: 'Nunito', data: detach(nunito), weight: 700, style: 'normal' },
      ]
      return cached
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
