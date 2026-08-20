/* eslint-disable @next/next/no-img-element -- Satori/ImageResponse renders raw elements; next/image cannot run inside an OG ImageResponse */
// ─────────────────────────────────────────────────────────────────────────────
// THE GENERATOR FOR THE ROOT SHARE CARD — a dev route, not the card itself (ADR-1002).
//
// This file used to live at `app/opengraph-image.tsx`, which made it the ROOT metadata image:
// Next inherits that module into EVERY page's metadata module, so all ~400 serverless functions
// carried whatever it imported. It imports `next/og`, and `next/og` loads `sharp` internally
// (getSharp() in @vercel/og/index.node.js), which drags `libvips-cpp.so` — 17.7MB — behind it.
// 384 functions that never render an image were each carrying ~20MB of rasteriser, 6.6GB of the
// deploy's disk, and it is what pushed `Deploying outputs` into ENOSPC on 2026-08-11.
//
// The card is a PURE FUNCTION OF BUILD-TIME CONSTANTS — SITE_NAME, SITE_TAGLINE, hero.jpg and the
// logo mark. It rendered identical bytes on every request. So it is a FILE now
// (`app/opengraph-image.jpg` + `app/twitter-image.jpg`), and this route is only how that file gets
// remade. Static metadata images are inherited the same way by every page, at no bundle cost.
//
// TO REGENERATE, after changing the artwork, the tagline, or the hero:
//
//     pnpm build && pnpm start &
//     curl -s localhost:3000/dev/og-root-card > app/opengraph-image.jpg
//     cp app/opengraph-image.jpg app/twitter-image.jpg
//     # keep the alt text in step: app/opengraph-image.alt.txt + app/twitter-image.alt.txt
//
// `lib/og/root-card.test.ts` fails if the alt files drift from SITE_NAME / SITE_TAGLINE, which is
// the one kind of staleness a committed image can hide. `pnpm check:og-trace` fails the build if
// a rasteriser ever reaches a function that does not render an image.
// ─────────────────────────────────────────────────────────────────────────────
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { loadNunito } from "@/lib/og/load-nunito";
import { cardResponse } from '@/lib/og/deliver'

export const runtime = "nodejs";
const size = { width: 1200, height: 630 };


export async function GET() {
  // Dev-only, like its /dev siblings (editor-controls, business-seeder-review): 404 in production.
  if (process.env.NODE_ENV === 'production') notFound();

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

  const [black, bold] = await Promise.all([
    loadNunito(900),
    loadNunito(700),
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

  return cardResponse(
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
