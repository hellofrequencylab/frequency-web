#!/usr/bin/env node
// HYG-244: the four modals SCAN-1225 left with no Tab trap take the kit trap
// (components/ui/use-dialog-focus-trap). For each file this reads the source with comments
// stripped and requires three things together: the hook is imported, it is called with a ref,
// and that same ref sits on the element that carries the modal markup (aria-modal="true" or
// role="alertdialog"). An import alone does not pass, and neither does a trap bound to some
// other element. Fails on the tree before this row (none of the four imports the hook).
//
// NOT PROVED HERE: that Tab wraps in a browser. That is the hook's own behaviour, shared with
// every other dialog on it; this check proves the four are wired to it.
import { readFileSync } from 'node:fs'

const FILES = [
  'components/layout/marketing-mobile-menu.tsx',
  'components/layout/admin-bar/admin-bar.tsx',
  'components/frequency/site/pages/themes/kit-showcase/kit-showcase-view.tsx',
  'components/frequency/admin/pages/moderation/report-queue.tsx',
]

const stripComments = (s) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const bad = []
for (const file of FILES) {
  let src
  try {
    src = stripComments(readFileSync(file, 'utf8'))
  } catch {
    bad.push(`${file}: missing`)
    continue
  }
  if (!/import\s*\{\s*useDialogFocusTrap\s*\}\s*from\s*'@\/components\/ui\/use-dialog-focus-trap'/.test(src)) {
    bad.push(`${file}: does not import the kit focus trap`)
    continue
  }
  const call = /useDialogFocusTrap\(\s*[^,()]+,\s*(\w+)\s*\)/.exec(src)
  if (!call) {
    bad.push(`${file}: imports the kit focus trap and never calls it`)
    continue
  }
  const ref = call[1]
  // The opening tag that carries the modal markup must also carry the trapped ref.
  const tags = src.match(/<(?:div|aside|section)\b[^>]*?(?:aria-modal="true"|role="alertdialog")[^>]*>/g) ?? []
  if (tags.length === 0) {
    bad.push(`${file}: no modal markup found, so the check has nothing to hold`)
    continue
  }
  if (!tags.some((t) => t.includes(`ref={${ref}}`))) {
    bad.push(`${file}: the trap's ref (${ref}) is not on the modal element`)
  }
}

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log(`modal-focus-trap-followup: ${FILES.length} modals are on the kit focus trap`)
