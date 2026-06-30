import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Best-effort Nunito subset from Google Fonts for Satori OG rendering, with a
// DETERMINISTIC local fallback. If the build-time fetch fails (e.g. googleapis
// throttling the many concurrent OG prerenders during `next build`), we fall back
// to the bundled Liberation Sans TTF instead of returning null. An empty `fonts`
// array makes Satori crash on `fontFamily.split(...)` and fails the whole build —
// this guarantees callers always get font bytes, so that can never happen.
async function fetchNunitoSubset(
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Nunito:wght@${weight}&text=${encodeURIComponent(
      text,
    )}`;
    const css = await (
      await fetch(url, {
        headers: {
          // Ask for a TTF (Satori can't parse woff2).
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      })
    ).text();
    const src = css.match(/src: url\((.+?)\) format\(/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

async function localFallback(weight: number): Promise<ArrayBuffer> {
  const file =
    weight >= 700 ? "LiberationSans-Bold.ttf" : "LiberationSans-Regular.ttf";
  const buf = await readFile(join(process.cwd(), "public/fonts", file));
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/**
 * Load a font for an OG `ImageResponse`. Tries a Nunito subset from Google Fonts
 * for the given text; on any failure falls back to the bundled Liberation Sans
 * TTF. Never returns null, so the caller's `fonts` array is always non-empty and
 * `next build` never crashes on an undefined `fontFamily`.
 */
export async function loadNunito(
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const subset = await fetchNunitoSubset(weight, text);
  return subset ?? (await localFallback(weight));
}
