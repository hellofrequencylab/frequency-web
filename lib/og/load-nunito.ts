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

/** Memoised per process, but only ONCE A READ HAS SUCCEEDED.
 *
 *  🔴 Caching the PROMISE eagerly was wrong: a single transient filesystem failure would cache a
 *  REJECTED promise, and that lambda would then serve broken share cards for the rest of its life
 *  with no path to recovery. Only resolved bytes go in the map, so a failed attempt is simply
 *  retried on the next card. */
const cache = new Map<number, ArrayBuffer>();
/** In-flight reads, so N concurrent cards do not each start their own. Cleared on settle. */
const inflight = new Map<number, Promise<ArrayBuffer>>();

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
 * ⚠️ THIS CAN REJECT, and the previous version of this comment claimed otherwise. The Liberation
 * fallback lives in the SAME `public/fonts` directory as Nunito, so it is a guard against ONE FILE
 * being missing, never against the directory being absent from the serverless bundle — the failure
 * that actually worried us. If public/fonts does not ship, both reads fail and this rejects.
 *
 * That is the honest behaviour and it is the right one: an OG route that throws returns a 500 and
 * the previewer falls back to a text card, which is recoverable. Swallowing the error and handing
 * Satori an empty `fonts` array crashes it on `fontFamily.split(...)` with a far worse message.
 * next.config.ts declares ./public/fonts/*.ttf in outputFileTracingIncludes so the directory does
 * ship; this doc exists so the next person does not trust a promise the code cannot keep.
 *
 * `text` is accepted and ignored, kept so call sites did not need rewriting when subsetting was
 * removed.
 */
export async function loadNunito(
  weight: number,
  _text?: string,
): Promise<ArrayBuffer> {
  const key = weight >= 800 ? 900 : 700;
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const attempt = read(key === 900 ? "Nunito-Black.ttf" : "Nunito-Bold.ttf")
    // Same-directory sibling: covers one corrupt/absent FILE, not an absent directory. Weight is
    // preserved (Bold->Bold), unlike the earlier version which quietly demoted 700 to Regular
    // while callers still declared weight 700 to Satori.
    .catch(() => read("LiberationSans-Bold.ttf"))
    .then((bytes) => {
      cache.set(key, bytes);
      return bytes;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, attempt);
  return attempt;
}
