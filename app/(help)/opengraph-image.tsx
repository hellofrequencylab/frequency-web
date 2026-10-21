import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME } from "@/lib/site";
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = "nodejs";
export const alt = `${SITE_NAME} Help Center`;
export const size = { width: 1200, height: 630 };
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  // Literal path: @vercel/nft cannot resolve one assembled from a variable (see lib/og/load-nunito.ts).
  const heroData = await readFile(join(process.cwd(), "public/images/hero.jpg"));

  // The Stage scrim (lib/og/stage-card.tsx) is what keeps the title legible over this bright beach
  // photograph. app/(help)/opengraph-image.test.tsx measures the pixels, because the previous scrim
  // drew nothing for months and nothing else could have noticed.
  return stageCardResponse({
    kicker: "Help Center",
    title: `${SITE_NAME} Help Center`,
    line: "Answers for members, hosts and Space owners.",
    coverPlaceholder: `data:image/jpeg;base64,${heroData.toString("base64")}`,
  });
}
