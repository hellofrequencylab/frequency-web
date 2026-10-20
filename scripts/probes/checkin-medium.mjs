#!/usr/bin/env node
// LIVE-1185 probe: NFC placards and QR codes are one check-in system. A Space check-in node's QR encodes
// the signed /n/<id>?s= link and its NFC placard holds the same link plus &m=nfc; the check-in records
// which one the member used (or a counter scanner card), and Scan stats counts them together, split by
// medium. Fails on main before LIVE-1185: capture took its source from nodes.type, so a placard tap on a
// QR-type check-in node counted as a QR scan, and Scan stats never counted check-ins at all.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const code = r('lib/qr/node-code.ts')
if (!/export function signedPlacardUrl/.test(code) || !/withMedium\(signedNodeUrl\(/.test(code))
  bad.push('no signedPlacardUrl built from signedNodeUrl, so a placard and its QR can drift apart')

const capture = r('lib/engagement/capture.ts')
if (!/function captureSource/.test(capture) || !/captureSource\(node\.type as string, attempt\.medium\)/.test(capture))
  bad.push('capture still takes its source from the node type alone')
if (!/context: \{ nodeId: attempt\.nodeId, medium/.test(capture)) bad.push('the check-in ledger row does not record its medium')

const action = r('app/(main)/n/[nodeId]/actions.ts')
if (!/medium: readScanMedium\(medium\)/.test(action)) bad.push('the /n claim does not pass the scanned medium to capture')

if (!/medium: 'device'/.test(r('lib/devices/scan.ts'))) bad.push('a counter scanner card is not recorded as the device medium')

const stats = r('app/(main)/admin/qr/stats/page.tsx')
if (!/summarizeCheckins\(/.test(stats) || !/'node_capture'/.test(stats)) bad.push('Scan stats does not count check-ins')

const card = r('components/spaces/checkin-code-card.tsx') + r('components/spaces/checkin-nfc-writer.tsx') + r('app/(main)/spaces/[slug]/settings/checkin/section.tsx')
if (!/signedPlacardUrl|withMedium\(/.test(card)) bad.push('the Space check-in NFC writer still writes the bare QR link')

if (bad.length) {
  console.error('LIVE-1185 FAIL:\n - ' + bad.join('\n - '))
  process.exit(1)
}
console.log('LIVE-1185 ok: one signed link for QR and NFC, check-ins record their medium, Scan stats splits them')
