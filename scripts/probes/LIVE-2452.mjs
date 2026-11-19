// LIVE-2452: the Spotlight editor previews the real Spotlight page in a frame, outside the member console's styles.
import { existsSync, readFileSync } from 'node:fs'
const fail = (m) => { console.error(`LIVE-2452: ${m}`); process.exit(1) }
const route = 'app/spaces/[slug]/spotlight/preview/page.tsx'
if (!existsSync(route)) fail('no preview page outside the (main) group')
const r = readFileSync(route, 'utf8')
if (!/resolveSpaceManageAccess/.test(r) || !/<SpaceSpotlight /.test(r)) fail('the preview page is not the gated SpaceSpotlight render')
const ed = readFileSync('components/spotlight/space-spotlight-editor.tsx', 'utf8')
if (!/<SpotlightPreviewFrame /.test(ed)) fail('the editor does not show the preview frame')
const fr = readFileSync('components/spotlight/spotlight-preview-frame.tsx', 'utf8')
if (!/<iframe/.test(fr) || !/spotlight\/preview/.test(fr)) fail('the preview frame is not an iframe of the preview page')
const page = readFileSync('app/(main)/spaces/[slug]/manage/spotlight/page.tsx', 'utf8')
if (/ThemedSpaceSpotlight|LiveNodeGrid|LiveProfileGrid/.test(page)) fail('the console page still draws the Spotlight inside the console')
console.log('LIVE-2452 ok')
