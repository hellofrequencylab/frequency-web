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
// network, no throttling. It also removes the build-time dependency on Google being reachable,
// which is the failure the previous implementation's fallback existed to survive in the first place.
//
// ⚠️ Same family and weights, NOT byte-identical output, and an earlier version of this comment
// claimed otherwise. The old path drew with a Google-served SUBSET of the Nunito VARIABLE font;
// these are committed STATIC instances. Worth knowing before chasing an apparent weight shift.
//
// ⚠️ FULL faces, not `&text=` subsets. The old code subset each font to the exact string being
// drawn, so a name containing a glyph outside that subset rendered as tofu. A full Nunito weight
// is ~125KB and is read once per process, so the subsetting bought nothing.

/** Memoised per process, but only ONCE A READ HAS SUCCEEDED.
 *
 *  🔴 Caching the PROMISE eagerly was wrong: a single transient filesystem failure would cache a
 *  REJECTED promise, and that lambda would then serve broken share cards for the rest of its life
 *  with no path to recovery. Only resolved bytes go in the map, so a failed attempt is simply
 *  retried on the next card. */
const cache = new Map<number, ArrayBuffer>();
/** In-flight reads, so N concurrent cards do not each start their own. Cleared on settle. */
const inflight = new Map<number, Promise<ArrayBuffer>>();

/** Detach the exact bytes. `readFile` hands back a Buffer that is a VIEW into a shared pool slab, so
 *  passing `buf.buffer` straight to Satori would hand it megabytes of unrelated memory. */
function detach(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

// ── ONE LITERAL PATH PER FACE, AND IT HAS TO STAY THAT WAY ────────────────────────────────
//
// 🔴 These three reads used to share one `read(file)` helper, and that single parameter cost ~300MB
// of deploy disk. @vercel/nft cannot resolve a path assembled from a variable, so it falls back to
// globbing the deepest prefix it CAN resolve — the whole `public/fonts` directory — into every
// function whose graph reaches this module. Measured off the real `.next` trace: 69 functions each
// carrying all five files, including LiberationSans-Regular (410,820 bytes, which nothing in this
// repo ever opens from disk) and the licence text. ADR-1004 is the same failure one layer up, where
// `join(process.cwd(), ...rubricPath)` swept the repo ROOT into ~300 functions.
//
// Written out as literals, nft resolves each read exactly and ships these three faces and nothing
// else — WITHOUT help from next.config.ts, which is why the catch-all include key there could be
// narrowed to the card routes. Verified with nodeFileTrace over both shapes before landing: the
// parameterised form emits all five files in the directory, the literal form emits exactly three.
//
// ⚠️ Reintroducing a `read(name)` helper — or hoisting "public/fonts" into a shared const and
// building the path from it — silently restores the glob. Nothing fails; the deploy just gets
// bigger. `og-fonts.test.ts` fails instead, which is the only reason that stays visible.
const readNunitoBlack = () =>
  readFile(join(process.cwd(), "public/fonts", "Nunito-Black.ttf")).then(detach);
const readNunitoBold = () =>
  readFile(join(process.cwd(), "public/fonts", "Nunito-Bold.ttf")).then(detach);
const readLiberationBold = () =>
  readFile(join(process.cwd(), "public/fonts", "LiberationSans-Bold.ttf")).then(
    detach,
  );

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
 * The faces ship because the reads above are literal-pathed, so the tracer resolves them; the
 * narrowed keys in next.config.ts name them a second time for the card routes. This doc exists so
 * the next person does not trust a promise the code cannot keep.
 */
export async function loadNunito(weight: number): Promise<ArrayBuffer> {
  const key = weight >= 800 ? 900 : 700;
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const attempt = (key === 900 ? readNunitoBlack() : readNunitoBold())
    // Same-directory sibling: covers one corrupt/absent FILE, not an absent directory. Weight is
    // preserved (Bold->Bold), unlike the earlier version which quietly demoted 700 to Regular
    // while callers still declared weight 700 to Satori.
    .catch(() => readLiberationBold())
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
