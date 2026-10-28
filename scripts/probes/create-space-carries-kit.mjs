// A /themes page that sends someone to the Create a Space wizard names the kit's theme (`?theme=`) as well
// as the niche, so the wizard's Look step starts on the kit they were looking at. Fails while a link
// carries only `?niche=`.
import { readFileSync } from 'node:fs'

const files = ['components/frequency/site/pages/themes/frequency-midnight.tsx']
const bad = files.filter((f) => !/spaces\/new\?niche=\$\{kit\}&theme=midnight/.test(readFileSync(f, 'utf8')))
if (bad.length) {
  console.error(`Create a Space links carry the niche but not the theme: ${bad.join(', ')}`)
  process.exit(1)
}
console.log('ok: kit pages send the theme with the niche')
