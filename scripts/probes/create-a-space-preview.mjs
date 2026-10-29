// The marketing /create-a-space page exists with its live preview: the page is routed and in the sitemap, the
// preview reads only the --pv-* contract, and every Mega Theme can fill that contract. Fails on main (no page).
import { existsSync, readFileSync } from 'node:fs'

const problems = []
const need = (cond, msg) => { if (!cond) problems.push(msg) }
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')

need(existsSync('app/(marketing)/create-a-space/page.tsx'), 'no /create-a-space page')
need(/createSpace:\s*'\/create-a-space'/.test(read('lib/frequency/site-nav.ts')), 'ROUTES has no createSpace')
need(read('app/sitemap.ts').includes('/create-a-space'), 'sitemap omits /create-a-space')
const preview = read('components/frequency/site/pages/create-space/space-preview.tsx') + read('components/frequency/site/pages/create-space/create-space.css')
need(preview.includes('data-preview-theme'), 'the preview does not name its theme')
need(!/var\(--fq-(?!bg-canvas|text-strong)/.test(read('components/frequency/site/pages/create-space/create-space.css').split('/* ---- Hero ---- */')[0]), 'the preview reads a page token other than the frame ones')
need(read('lib/theme/preview-tokens.ts').includes('PREVIEW_TOKEN_KEYS'), 'no --pv token contract')
need(existsSync('lib/theme/preview-tokens.test.ts'), 'no contract guard test')
if (problems.length) {
  console.error(problems.join('; '))
  process.exit(1)
}
console.log('ok: /create-a-space has its live preview on the --pv contract')
