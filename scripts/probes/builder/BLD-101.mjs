// BLD-101: the new builder's frame exists, opens only when asked, and no visitor page can import it.
// The editor-bytes-on-public-render ratchet, at 0: the only file that may import components/builder is the
// website editor's client loader, which itself sits behind the /admin/editor route.
import fs from 'node:fs'
import path from 'node:path'
const bad = []
for (const f of ['components/builder/shell/builder-shell.tsx', 'lib/builder/state.ts']) if (!fs.existsSync(f)) bad.push(`missing ${f}`)
const ALLOWED = new Set(['components/sites/editor/website-editor.tsx'])
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]))
for (const root of ['app', 'components', 'lib']) {
  for (const file of walk(root)) {
    if (!/\.(tsx?|mts)$/.test(file) || file.startsWith('components/builder/') || /\.test\.tsx?$/.test(file)) continue
    if (/from ['"]@\/components\/builder\//.test(fs.readFileSync(file, 'utf8')) && !ALLOWED.has(file)) bad.push(`${file} imports the builder`)
  }
}
const loader = fs.readFileSync('components/sites/editor/website-editor.tsx', 'utf8')
if (!/dynamic\(\(\) => import\('@\/components\/builder\/shell\/builder-shell'\)/.test(loader)) bad.push('the builder must load dynamically, not with a static import')
if (!/builder === 'v3' \? <BuilderShell/.test(loader)) bad.push('flag off must render the current editor')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
