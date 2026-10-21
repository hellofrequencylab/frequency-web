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
import { stageCardResponse } from "@/lib/og/stage-card";

export const runtime = "nodejs";

export async function GET() {
  // Dev-only: 404 in production. It is now the ONLY route under /dev, since its two siblings were
  // deleted as unreferenced (ADR-1294, HYG-075).
  if (process.env.NODE_ENV === 'production') notFound();

  const heroData = await readFile(
    join(process.cwd(), "public/images/hero.jpg"),
  );

  // The same Stage card every other page type draws (lib/og/stage-card.tsx): the site name is the
  // title, the tagline rides the pill so lib/og/root-card.test.ts keeps matching what the site
  // calls itself, and the beach photograph is the entity image for the brand.
  return stageCardResponse({
    kicker: SITE_TAGLINE,
    title: SITE_NAME,
    line: "A place to be human.",
    coverPlaceholder: `data:image/jpeg;base64,${heroData.toString("base64")}`,
  });
}
