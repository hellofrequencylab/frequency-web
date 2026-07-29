import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ── Font bytes for Satori OG cards. READ FROM DISK, NEVER FETCHED. ────────────────────────
//
// 🔴 WHY THIS WAS REWRITTEN. This module used to fetch a Nunito subset from
// `fonts.googleapis.com` on EVERY render: one CSS request plus one TTF request, per weight,
// twice = four network round trips before Satori drew a single pixel. Measured against the live
// endpoint: **1,628ms for the CSS alone, ~3.4 seconds for both weights.** The claim card then
// also fetches the Space's cover and its logo, and rasterises a 1200x630 PNG, on a cold lambda.
//
// That is why a Business Space claim link previewed as a bare title + favicon in Apple Mail while
// iMessage showed the full card. Both read the same, correct `og:image` tag — the tags were never
// the problem. Mail's LinkPresentation timeout is short, the image did not arrive in time, and it
// fell back to the icon-only layout. Reported three times as "no preview appeared".
//
// The faces are now committed under `public/fonts/` and read with `readFile`: sub-millisecond, no
// network, no throttling, byte-identical output. It also removes the build-time dependency on
// Google being reachable, which is the failure the previous implementation's fallback existed to
// survive in the first place.
//
// ⚠️ FULL faces, not `&text=` subsets. The old code subset each font to the exact string being
// drawn, so a name containing a glyph outside that subset rendered as tofu. A full Nunito weight
// is ~53KB and is read once per process, so the subsetting bought nothing.

/** Memoised per process: a warm lambda reads each face once, not once per card. */
const cache = new Map<number, Promise<ArrayBuffer>>();

function read(file: string): Promise<ArrayBuffer> {
  return readFile(join(process.cwd(), "public/fonts", file)).then(
    (buf) =>
      buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer,
  );
}

/**
 * Load a Nunito face for an OG `ImageResponse`. Weight >= 800 gets Black, otherwise Bold.
 *
 * NEVER rejects into the caller: an empty `fonts` array makes Satori crash on
 * `fontFamily.split(...)` and takes the whole build with it, so a missing Nunito file falls back
 * to the bundled Liberation Sans rather than throwing. `text` is accepted and ignored — kept so
 * call sites did not need rewriting when subsetting was removed.
 */
export async function loadNunito(
  weight: number,
  _text?: string,
): Promise<ArrayBuffer> {
  const key = weight >= 800 ? 900 : 700;
  let hit = cache.get(key);
  if (!hit) {
    hit = read(key === 900 ? "Nunito-Black.ttf" : "Nunito-Bold.ttf").catch(() =>
      read(
        key === 900 ? "LiberationSans-Bold.ttf" : "LiberationSans-Regular.ttf",
      ),
    );
    cache.set(key, hit);
  }
  return hit;
}
