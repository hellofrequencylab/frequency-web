#!/usr/bin/env node
// LIVE-2318: dropping a file onto a photo field (or anywhere on the event form) must never make the
// browser open the file and lose the form. Checks the consequence in source:
//   1. ImageUpload cancels dragover and drop and uploads a dropped file through its normal gate.
//   2. A dropped PDF gets the plain "That is a PDF" message.
//   3. The event form itself cancels a stray dragover/drop.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const fails = []
const upload = read('components/ui/image-upload.tsx')
const kinds = read('lib/library/upload-kinds.ts')
const form = read('app/(main)/events/new/event-form.tsx')

if (!/onDrop=\{onDrop\}/.test(upload) || !/onDragOver=\{onDragOver\}/.test(upload)) {
  fails.push('ImageUpload has no drop zone (onDragOver/onDrop) around its control')
}
const dropFn = upload.match(/function onDrop\([\s\S]*?\n {2}\}/)?.[0] ?? ''
if (!/preventDefault\(\)/.test(dropFn)) fails.push('ImageUpload onDrop does not preventDefault, so the browser opens the file')
if (!/droppedFileProblem\(/.test(dropFn) || !/pick\(file\)/.test(dropFn)) {
  fails.push('ImageUpload onDrop does not check the file and upload it through pick()')
}
if (!kinds.includes("'That is a PDF. Cover images need to be a photo (JPG or PNG).'")) {
  fails.push('no plain message for a dropped PDF in lib/library/upload-kinds.ts')
}
const formTag = form.match(/<form[\s\S]*?>/)?.[0] ?? ''
if (!/onDragOver=/.test(formTag) || !/onDrop=/.test(formTag)) {
  fails.push('the event form does not cancel a stray dragover/drop on <form>')
}

if (fails.length) {
  console.error(`LIVE-2318 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2318 ok: photo fields take a dropped image, name a dropped PDF, and the event form ignores stray drops')
