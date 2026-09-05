// ─────────────────────────────────────────────────────────────────────────────
// CATALOG-ONLY ENTITY MANIFESTS (docs/STUDIO.md, ADR-986).
//
// Five things a member or operator can create that deliberately get NO wizard: a Channel, a Room,
// a Hub, a Nexus, and a Broadcast (owner decision, 2026-08-11). Each is two or three fields on a
// modal that already works; a guided flow with two doors and a mood dial would be ceremony around
// a name and a description.
//
// So why declare them at all? Because the catalog is only useful if it is COMPLETE. The registry
// answers "what can this viewer make here?", and an entity missing from it is invisible to the
// universal Create affordance and has no single place its create-gate is stated. Declaring the row
// is what makes the catalog trustworthy; declaring a wizard is a separate decision.
//
// The shape of that decision lives in the DATA: none of these declares `accepts` or `steer`, so
// nothing can render a drop zone or a mood dial for them. A catalog row and a wizard row differ by
// what they declare, not by a flag somewhere else.
//
// Paths mirror the FormData keys the existing create actions read, which are also the column names:
//   channel  -> app/(main)/channels/actions.ts createChannel
//               (2026-09-05, scan two L9-01: createChannel is retired; the live creator is
//               createTopicalChannel in the same file, writing topical_channels)
//   room     -> app/(main)/messages/rooms/actions.ts createRoom
//   hub      -> app/(main)/admin/actions.ts createHub
//   nexus    -> app/(main)/admin/actions.ts createNexus
//   broadcast-> app/(main)/nearby/* dispatch compose
//
// STRICT BOUNDARY: entities import from the kernel; the kernel never imports from entities.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldOption } from '@/lib/studio/kernel/manifest'

/** Mirrors the channel type toggle that lived in components/compose/new-channel-compose.tsx
 *  (deleted 2026-09-05, scan two L9-01; the live form is app/(main)/channels/new-channel-compose). */
const CHANNEL_TYPES: readonly FieldOption[] = [
  { value: 'group', label: 'Group' },
  { value: 'event', label: 'Event' },
  { value: 'thread', label: 'Thread' },
]

/** Mirrors the room visibility choice in components/compose/new-room-compose.tsx. */
const ROOM_VISIBILITY: readonly FieldOption[] = [
  { value: 'public', label: 'Anyone here' },
  { value: 'private', label: 'Invite only' },
]

/** Mirrors the status choice the hub and nexus admin forms share. */
const PLACE_STATUS: readonly FieldOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'forming', label: 'Forming' },
  { value: 'archived', label: 'Archived' },
]

/** Mirrors the dispatch type in app/(main)/nearby/broadcast-compose.tsx. */
const DISPATCH_TYPES: readonly FieldOption[] = [
  { value: 'post', label: 'Post' },
  { value: 'alert', label: 'Alert' },
  { value: 'invite', label: 'Invite' },
]

export const CHANNEL_MANIFEST: EntityManifest = {
  entity: 'channel',
  label: 'Channel',
  verify: 'none',
  sections: [{ key: 'basics', title: 'Basics', desc: 'What the channel is for, and who can see it.' }],
  fields: [
    { path: 'name', label: 'Name', kind: 'text', section: 'basics', required: true, placement: 'inline' },
    { path: 'description', label: 'Description', kind: 'longtext', section: 'basics', placement: 'inline' },
    { path: 'type', label: 'Kind', kind: 'select', section: 'basics', options: CHANNEL_TYPES },
    { path: 'isPublic', label: 'Open to anyone here', kind: 'toggle', section: 'basics' },
    { path: 'scopeId', label: 'Belongs to', kind: 'reference', section: 'basics', optionsFrom: 'circles', omitWhenEmpty: true },
  ],
}

export const ROOM_MANIFEST: EntityManifest = {
  entity: 'room',
  label: 'Room',
  verify: 'none',
  sections: [{ key: 'basics', title: 'Basics', desc: 'What the room is for, and who can join it.' }],
  fields: [
    { path: 'name', label: 'Name', kind: 'text', section: 'basics', required: true, placement: 'inline' },
    { path: 'description', label: 'Description', kind: 'longtext', section: 'basics', placement: 'inline' },
    { path: 'visibility', label: 'Who can join', kind: 'select', section: 'basics', options: ROOM_VISIBILITY },
    { path: 'scope_id', label: 'Belongs to', kind: 'reference', section: 'basics', optionsFrom: 'circles', omitWhenEmpty: true },
  ],
}

export const HUB_MANIFEST: EntityManifest = {
  entity: 'hub',
  label: 'Hub',
  verify: 'none',
  sections: [{ key: 'basics', title: 'Basics', desc: 'The place it covers, who guides it, and where it sits.' }],
  fields: [
    { path: 'name', label: 'Name', kind: 'text', section: 'basics', required: true, placement: 'inline' },
    { path: 'status', label: 'Status', kind: 'select', section: 'basics', options: PLACE_STATUS },
    { path: 'guide_id', label: 'Guide', kind: 'reference', section: 'basics', optionsFrom: 'members', omitWhenEmpty: true },
    { path: 'nexus_id', label: 'Nexus', kind: 'reference', section: 'basics', optionsFrom: 'nexuses', omitWhenEmpty: true },
  ],
}

export const NEXUS_MANIFEST: EntityManifest = {
  entity: 'nexus',
  label: 'Nexus',
  verify: 'none',
  sections: [{ key: 'basics', title: 'Basics', desc: 'The region it covers, who mentors it, and how big it grows.' }],
  fields: [
    { path: 'name', label: 'Name', kind: 'text', section: 'basics', required: true, placement: 'inline' },
    { path: 'status', label: 'Status', kind: 'select', section: 'basics', options: PLACE_STATUS },
    { path: 'member_cap', label: 'Member cap', kind: 'number', section: 'basics' },
    { path: 'mentor_id', label: 'Mentor', kind: 'reference', section: 'basics', optionsFrom: 'members', omitWhenEmpty: true },
    { path: 'outpost_id', label: 'Outpost', kind: 'reference', section: 'basics', optionsFrom: 'outposts', omitWhenEmpty: true },
  ],
}

export const BROADCAST_MANIFEST: EntityManifest = {
  entity: 'broadcast',
  label: 'Dispatch',
  verify: 'none',
  sections: [{ key: 'basics', title: 'Basics', desc: 'What you are sending, and who hears it.' }],
  fields: [
    { path: 'title', label: 'Title', kind: 'text', section: 'basics', required: true, placement: 'inline' },
    { path: 'body', label: 'Message', kind: 'longtext', section: 'basics', placement: 'inline' },
    { path: 'type', label: 'Kind', kind: 'select', section: 'basics', options: DISPATCH_TYPES },
  ],
}
