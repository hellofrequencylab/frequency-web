// THEME SHARE CARDS (LIVE-2114): the link preview for every /themes page, drawn by the one Stage share
// card (lib/og/stage-card.tsx) and saved as static files under public/brand/theme-share/<id>.jpg (outside public/themes, whose folders lib/themes/library.test.ts reserves for owner-made assets). Static on
// purpose: a new opengraph-image route fans out into the build (check:og-trace, check:build-fanout) and
// the production build already runs near its memory ceiling. Re-run after a theme's name, tagline or
// cover photo changes:
//   pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/theme-share-cards.render.tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { it } from 'vitest'
import { stageCardResponse } from '@/lib/og/stage-card'
import { THEME_SHARE_CARDS } from '@/lib/themes/share-cards'

async function coverDataUrl(publicPath: string): Promise<string> {
  // Satori reads JPEG and PNG, not WebP, so every cover is re-encoded at the card's size.
  const src = await readFile(join(process.cwd(), 'public', publicPath))
  const jpg = await sharp(src).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

it('draws one share card per theme page', async () => {
  for (const card of THEME_SHARE_CARDS) {
    const res = await stageCardResponse({
      kicker: 'A Frequency Theme',
      title: card.name,
      line: card.line,
      meta: 'Website, Spotlight, Space and email',
      cta: 'See the theme',
      coverPlaceholder: await coverDataUrl(card.cover),
    })
    const out = join(process.cwd(), 'public', card.image)
    await mkdir(join(out, '..'), { recursive: true })
    await writeFile(out, Buffer.from(await res.arrayBuffer()))
  }
})
