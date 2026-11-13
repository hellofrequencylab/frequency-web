#!/usr/bin/env node
// EMAIL-045: a person who submits a Space's contact form gets an acknowledgement, not only the owner.
// Fails when the contact-form door stops calling the sender, or the sender stops honoring the suppression list,
// the one-per-address-per-Space-per-hour limit, or the outbox dedupe key.
import { readFileSync } from 'node:fs'
const door = readFileSync('app/(main)/spaces/[slug]/contact-form-actions.ts', 'utf8')
const io = readFileSync('lib/crm/contact-ack-io.ts', 'utf8')
const bad = []
if (!door.includes('sendContactAck(')) bad.push('contact form no longer sends the submitter acknowledgement')
if (!io.includes('isSuppressed(')) bad.push('acknowledgement no longer checks the suppression list')
if (!io.includes('claimOnce(')) bad.push('acknowledgement lost its once-per-hour claim')
if (!io.includes('dedupeKey')) bad.push('acknowledgement lost its outbox dedupe key')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
