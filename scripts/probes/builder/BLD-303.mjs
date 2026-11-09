// BLD-303: the theme lens. Hovering a theme card wears it on the canvas through the live resolver (one commit: tokens and
// data-website-theme together), the contract skin module is prefetched on hover, the lens is pure and asks the server for
// nothing, committing is one edit (one undo step), and pinned layouts never change on a switch (tested over every role and
// every theme pair).
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const lens = read('lib/builder/theme-lens.ts')
for (const fn of ['siteThemeOf', 'lensStyle', 'commitTheme', 'themeCards', 'sectionLayouts']) if (!lens.includes(`export function ${fn}(`)) bad.push(`theme-lens.ts must export ${fn}`)
if (/fetch\(|@\/lib\/sites\/editor\/actions|@\/lib\/supabase|from 'react'/.test(lens)) bad.push('the lens must be pure: no request, no server action, no React')
if (!/roleVariant\(role, pinned \? props\.variant : ''/.test(lens)) bad.push('the layout rule must be roleVariant() over the pin')
const sheet = read('components/builder/theme/theme-lens.tsx')
if (!/onPointerEnter=\{\(\) => \{ void prefetchTheme\(\); onTry\(c\.id\) \}\}/.test(sheet)) bad.push('hovering a card must prefetch the skin and try the theme')
if (!/onPointerLeave=\{\(\) => onTry\(null\)\}/.test(sheet)) bad.push('leaving the cards must put the draft\'s theme back')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/lensStyle\(siteStyle, state\.draft, trying\)/.test(shell)) bad.push('the canvas style must come from the lens over the draft and the tried theme')
if (!/trySkin=\{trySkin\}/.test(shell) || !/useTryItOnSkin\(pageDocs, style\?\.theme/.test(shell)) bad.push('the canvas must wear the contract skin for the worn theme')
if (!/edit\(next\)/.test(shell) || !/commitTheme\(latest\.current\.draft, id\)/.test(shell)) bad.push('a pick must be one edit of the draft')
if (!/data-action="theme"/.test(shell) || !read('lib/builder/commands.ts').includes("theme: { label: 'Change the theme'")) bad.push('the theme action must be in the top bar and in ⌘K')
const test = read('lib/builder/theme-lens.test.ts')
if (!/if \(layout\.pinned\) expect\(layout\.variant\)\.toBe\(was\[j\]\.variant\)/.test(test) || !/for \(const to of SITE_THEMES\)/.test(test)) bad.push('the test must hold pinned layouts over every theme pair')
if (!/expect\(s\.past\)\.toHaveLength\(1\)/.test(test)) bad.push('the test must prove a commit is one undo step')
if (/#[0-9a-fA-F]{3,8}\b/.test(read('components/builder/theme/theme-lens.module.css'))) bad.push('no hex in the builder chrome')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
