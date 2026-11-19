// SCAN-1271: a Space tab with nothing on it says noindex, and every Space tab carries a share image.
import { readFileSync } from 'node:fs'

const meta = readFileSync('lib/spaces/profile-metadata.ts', 'utf8')
const program = readFileSync('app/(main)/spaces/[slug]/(profile)/-/program/page.tsx', 'utf8')
const bad = []
if (!/empty\?: boolean/.test(meta)) bad.push('a tab cannot say it is empty (no `empty` on the tab meta)')
if (!/SITEMAP_GATED_SEGMENTS/.test(meta) || !/listNetworkedSpaceProfileTabs/.test(meta))
  bad.push('the metadata does not ask the sitemap reader whether a gated tab is advertised')
if (!/thin \? \{ robots: \{ index: false, follow: true \} \}/.test(meta)) bad.push('a thin tab is not marked noindex, follow')
if (!/tabImages = tab \? \{ images: ROOT_OG_IMAGES \}/.test(meta)) bad.push('a Space tab carries no share image')
if (!/twitter: \{[^\n]*\.\.\.tabImages/.test(meta)) bad.push('the twitter card of a Space tab carries no image')
if (!/empty: await nothingPublished\(slug\)/.test(program)) bad.push('the Program tab does not report an empty program')
if (bad.length) {
  console.error('SCAN-1271: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1271: an empty Space tab is noindex, follow and every Space tab carries a share image')
