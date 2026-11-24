// LIVE-2523: a Space owner's email editor must not throw them off the page. The canvas editor listed the
// team's shared saved sections on mount through a server action gated by requireAdmin, which REDIRECTS a
// non-staff caller; a redirect from a server action navigates the whole page, so the editor closed itself
// the moment it opened. Consequences checked: (1) the shared-library read answers null and never redirects,
// (2) the editor pane only hands the staff library to the admin save path, (3) no Space surface passes it.
import { readFileSync } from 'node:fs'

const bad = []
const read = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    bad.push(`cannot read ${f}`)
    return ''
  }
}
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const actions = code(read('lib/email-studio/saved-sections-actions.ts'))
const list = actions.slice(actions.indexOf('export async function listSavedSections'))
const listBody = list.slice(0, list.indexOf('\n}') + 2)
if (!listBody.includes('listSavedSections')) bad.push('listSavedSections not found')
if (/requireAdmin|redirect\(|notFound\(/.test(actions)) bad.push('saved-sections-actions.ts can still redirect a caller (requireAdmin / redirect / notFound)')
if (!/return null/.test(listBody)) bad.push('listSavedSections does not answer null to a caller without access')

const pane = code(read('components/admin/email-studio/editor-pane.tsx'))
if (/library=\{\s*(sharedLibrary|SHARED_SAVED_LIBRARY)\s*\}/.test(pane)) bad.push('editor-pane.tsx still hands the staff library to the canvas unconditionally')
if (!/saveCampaign === saveEmailCampaign \? SHARED_SAVED_LIBRARY/.test(pane)) bad.push('editor-pane.tsx does not limit the default shared library to the admin save path')

for (const f of [
  'components/spaces/marketing/space-email-compose-popup.tsx',
  'components/spaces/marketing/space-email-workspace.tsx',
  'modules/crm/components/space-member-composer.tsx',
]) {
  const t = code(read(f))
  if (/SHARED_SAVED_LIBRARY|listSavedSections/.test(t)) bad.push(`${f} reaches the staff-only saved library`)
}
const ws = code(read('components/admin/email-studio/workspace.tsx'))
if (!/savedLibrary=\{actions \? undefined : SHARED_SAVED_LIBRARY\}/.test(ws)) bad.push('workspace.tsx does not keep the shared library to the admin bundle')

if (bad.length) {
  console.error(`LIVE-2523 FAILED:\n${bad.join('\n')}`)
  process.exit(1)
}
console.log('LIVE-2523 ok: the shared saved-sections read never redirects, and only the admin editor gets it')
