// LIVE-2283: every Create a Space preview theme wears its own look, and the address bar reads the business name.
import { readFileSync } from 'node:fs'
const css = readFileSync('components/frequency/site/pages/create-space/create-space-themes.css', 'utf8')
const site = readFileSync('lib/create-space/preview-site.ts', 'utf8')
const bad = []
for (const t of ['new-world', 'services', 'designer', 'midnight', 'network-kit', 'temple-kit', 'bold', 'wildheart']) {
  if (!css.includes(`[data-preview-theme="${t}"]`)) bad.push(`no preview block for ${t}`)
}
if (!/domain: `\$\{[^`]*\}\.frequencylocal\.com`/.test(site)) bad.push('the address bar does not read <name>.frequencylocal.com')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
