import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${SITE_NAME} Help Center`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Pull a single-weight TTF subset from Google Fonts for Satori. Best-effort:
// if the network fetch fails at build time, ImageResponse falls back to its
// built-in font rather than failing the build.
async function loadNunito(weight: number, text: string) {
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

export default async function Image() {
  const wordmark = SITE_NAME.toUpperCase();
  const label = "HELP CENTER";

  const heroData = await readFile(
    join(process.cwd(), "public/images/hero.jpg"),
  );
  const heroSrc = `data:image/jpeg;base64,${heroData.toString("base64")}`;

  const glyphs = `${wordmark}${label}`;
  const [black, bold] = await Promise.all([
    loadNunito(900, glyphs),
    loadNunito(700, glyphs),
  ]);

  const fonts = [
    black && { name: "Nunito", data: black, weight: 900 as const, style: "normal" as const },
    bold && { name: "Nunito", data: bold, weight: 700 as const, style: "normal" as const },
  ].filter(Boolean) as {
    name: string;
    data: ArrayBuffer;
    weight: 900 | 700;
    style: "normal";
  }[];

  const fontFamily = fonts.length ? "Nunito" : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
        }}
      >
        {/* Hero photo */}
        <img
          src={heroSrc}
          alt=""
          width={size.width}
          height={size.height}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        {/* Gradient overlay — slightly heavier to keep the label legible */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.50) 38%, rgba(0,0,0,0.82) 72%, rgba(0,0,0,0.97) 100%)",
          }}
        />
        {/* Text stack */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            width: "100%",
            height: "100%",
            padding: 72,
          }}
        >
          {/* Accent pill */}
          <div
            style={{
              width: 84,
              height: 8,
              borderRadius: 9999,
              backgroundColor: "#6366f1",
              marginBottom: 28,
            }}
          />
          {/* Wordmark */}
          <div
            style={{
              fontFamily,
              fontWeight: 900,
              fontSize: 112,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              textShadow: "0 2px 24px rgba(0,0,0,0.55)",
            }}
          >
            {wordmark}
          </div>
          {/* "Help Center" label */}
          <div
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: 34,
              letterSpacing: "0.32em",
              marginTop: 18,
              color: "rgba(255,255,255,0.92)",
              textShadow: "0 1px 12px rgba(0,0,0,0.6)",
            }}
          >
            {label}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
