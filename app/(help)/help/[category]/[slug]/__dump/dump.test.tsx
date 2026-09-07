import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import Image from '../../../../../../app/(help)/help/[category]/[slug]/opengraph-image'
const OUT = '/tmp/claude-0/-home-user-frequency-web/1da4bd05-3caa-53f3-a450-d0643ea4c152/scratchpad'
it('dump', async () => {
  for (const [c, s] of [['getting-started','join-a-circle'],['find-your-people','high-functioning-loneliness'],['the-quest','streaks']] as const) {
    const res = await Image({ params: Promise.resolve({ category: c, slug: s }) })
    writeFileSync(`${OUT}/card-${s}.jpg`, Buffer.from(await res.arrayBuffer()))
  }
}, 120_000)
