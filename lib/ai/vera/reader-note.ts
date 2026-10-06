// Vera's one-line reader note (ADR-1715, LIVE-796). Who signed up, in plain words, from the persona the
// member picked at intake (profiles.meta.persona) and the arrival follow-up's archetype
// (profiles.meta.archetype). PURE.
//
// Never age band or gender: neither is collected, and neither may enter a prompt. Never an archetype
// NAME: the note describes the person the way they described themselves, and tells Vera not to label
// them back.

import { isArchetypeId, type ArchetypeId } from '@/lib/audience/archetypes'

export interface VeraReader {
  persona?: string | null
  archetype?: string | null
}

const PERSONA_LINE: Record<string, string> = {
  visitor: 'This member signed up to find their people.',
  builder: 'This member signed up to host.',
  practitioner: 'This member signed up as a practitioner with something to offer.',
  partner: 'This member runs a local business or space.',
  investor: 'This member is interested in a Frequency Lab in their town.',
}

const ARCHETYPE_LINE: Record<ArchetypeId, string> = {
  wired_professional: 'They told us they can’t switch off.',
  transplant: 'They told us they’re new around here.',
  activity_first: 'They’d rather start with something to do, like a run or a game night.',
  evidence_first: 'They want plain tools, no fluff.',
  mission_patron: 'They want to help keep Frequency free for others.',
  host_connector: 'They have not hosted yet and want to.',
  gathering_host: 'They already run something that is growing.',
  portfolio_teacher: 'They teach at a few studios.',
  second_act: 'They run their own practice.',
  studio_keeper: 'They run a studio or space.',
  network_steward: 'They run several groups or a nonprofit.',
}

/** The one-line note, or '' when nothing is known. */
export function veraReaderNote(reader: VeraReader | null | undefined): string {
  const persona = reader?.persona ? PERSONA_LINE[reader.persona] : undefined
  const archetype = isArchetypeId(reader?.archetype) ? ARCHETYPE_LINE[reader!.archetype as ArchetypeId] : undefined
  if (!persona && !archetype) return ''
  return [persona, archetype].filter(Boolean).join(' ') + ' Use it to pick what to point them at first; never say it back to them as a label.'
}
