import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import Image from '../../../../opengraph-image'
const OUT = '/tmp/claude-0/-home-user-frequency-web/1da4bd05-3caa-53f3-a450-d0643ea4c152/scratchpad'
it('dump group', async () => {
  const res = await Image()
  writeFileSync(`${OUT}/card-GROUP.jpg`, Buffer.from(await res.arrayBuffer()))
}, 120_000)
