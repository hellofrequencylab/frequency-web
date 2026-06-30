import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { loadNunito } from "@/lib/og/load-nunito";

export const runtime = "nodejs";
export const alt = `${SITE_NAME} · ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const wordmark = SITE_NAME.toUpperCase();
  const tagline = SITE_TAGLINE.toUpperCase();

  const heroData = await readFile(
    join(process.cwd(), "public/images/hero.jpg"),
  );
  const heroSrc = `data:image/jpeg;base64,${heroData.toString("base64")}`;

  const markData = await readFile(
    join(process.cwd(), "public/images/Frequency-Logo-Round-Icon-white.png"),
  );
  const markSrc = `data:image/png;base64,${markData.toString("base64")}`;

  const glyphs = `${wordmark}${tagline}`;
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 38%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0.96) 100%)",
          }}
        />
        <img
          src={markSrc}
          alt=""
          width={104}
          height={104}
          style={{ position: "absolute", top: 64, left: 72, width: 104, height: 104 }}
        />
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
          <div
            style={{
              width: 84,
              height: 8,
              borderRadius: 9999,
              backgroundColor: "#6366f1",
              marginBottom: 28,
            }}
          />
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
            {tagline}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
