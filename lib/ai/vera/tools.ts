// Vera's bounded tool surface (ADR-066, ADR-028). The COMPLETE catalog of actions
// Vera may ever take — declared up front, the same governance pattern as the trait
// registry. The conversational agent loop (a later step, gated on the consent/test
// harness per ADR-028) can call ONLY these tools, and every `write` tool requires an
// explicit member confirmation before it touches anything (propose-and-confirm).
//
// Read tools are safe (suggest/find — no mutation). Write tools propose a change the
// member must approve. There are NO autonomous writes: the model proposes, the human
// confirms, the code executes. This file is the contract that makes that enforceable.

import { createEntityToolDef } from './create-tools'
import { adminQuestionList } from './admin-questions'
import { ticketChangeGuide } from './admin-changes'

type ToolMode = 'read' | 'write'
export type ParamType = 'string' | 'number' | 'boolean'

interface ToolParam {
  name: string
  type: ParamType
  required: boolean
  description: string
}

export interface VeraToolDef {
  key: string
  description: string
  mode: ToolMode
  params: ToolParam[]
  /** Member-facing label shown on the confirmation for a `write` tool. */
  confirmLabel?: string
}

export const VERA_TOOLS: readonly VeraToolDef[] = [
  // ── Read — safe, no mutation (the bridge-to-humans core; AI-VERA §3) ─────────
  {
    key: 'suggest_circle',
    description: 'Suggest a circle the member might join, optionally matched to an interest.',
    mode: 'read',
    params: [{ name: 'interest', type: 'string', required: false, description: 'An interest to match on.' }],
  },
  {
    key: 'find_host',
    description: 'Find the human host/guide best placed to answer — Vera routes to people.',
    mode: 'read',
    params: [{ name: 'topic', type: 'string', required: true, description: 'What the member needs help with.' }],
  },

  // ── Write — propose-and-confirm; the member must approve before anything happens
  {
    key: 'remember_fact',
    description: "Save a durable fact the member shared to Vera's memory (ai_member_context).",
    mode: 'write',
    confirmLabel: 'Save this to what Vera remembers',
    params: [
      { name: 'fact', type: 'string', required: true, description: 'The fact, in the member’s words.' },
      { name: 'category', type: 'string', required: false, description: 'interests | goals | constraints.' },
    ],
  },
  {
    key: 'set_profile_field',
    description: 'Propose an update to one of the member’s own profile fields.',
    mode: 'write',
    confirmLabel: 'Update your profile',
    params: [
      { name: 'field', type: 'string', required: true, description: 'display_name | bio | neighborhood.' },
      { name: 'value', type: 'string', required: true, description: 'The proposed value.' },
    ],
  },
  {
    key: 'draft_intro',
    description:
      'Coach the member through introducing themselves to a host or member. Returns questions and a route to write their own introduction. Never drafts, publishes, or sends words on their behalf.',
    mode: 'read',
    params: [
      { name: 'toHandle', type: 'string', required: true, description: 'Handle of the person they want to meet.' },
    ],
  },
  {
    key: 'join_circle',
    description: 'Get the member into a circle they chose. Use the exact slug from suggest_circle. This is the goal of onboarding — propose it as soon as a circle fits.',
    mode: 'write',
    confirmLabel: 'Join this circle',
    params: [{ name: 'circle', type: 'string', required: true, description: 'The slug (preferred) or name of the circle to join.' }],
  },

  // ── Resonance Engine playbook actions (ADR-382) ──────────────────────────────
  // The governed write tools a Playbook (lib/playbooks/registry.ts) may invoke. Each
  // records a touch on the CRM timeline via lib/crm/interactions.ts with
  // source:'playbook' + metadata.playbook_id (idempotent). Three are in-product +
  // reversible; send_playbook_email is OUTBOUND, so it DRAFTS only — it passes the
  // send-gate and NEVER auto-sends (suggest-by-default, the brand-fatal-otherwise rule).
  {
    key: 'save_streak',
    description:
      "Save a member's practice streak with a freeze. In-product and reversible (an Undo restores it), so it is the auto-eligible playbook for a streak about to break.",
    mode: 'write',
    confirmLabel: 'Save their streak',
    params: [
      { name: 'subjectProfileId', type: 'string', required: true, description: 'The member whose streak to save (their profile id).' },
      { name: 'playbookId', type: 'string', required: false, description: 'The playbook id that proposed this (for the timeline + run audit).' },
    ],
  },
  {
    key: 'tag_contact',
    description: 'Add a short label to a CRM contact (e.g. "cooling", "ready-to-deepen"). In-product, reversible, no member touch.',
    mode: 'write',
    confirmLabel: 'Tag this contact',
    params: [
      { name: 'contactId', type: 'string', required: true, description: 'The contact to tag.' },
      { name: 'tag', type: 'string', required: true, description: 'The label to add.' },
      { name: 'playbookId', type: 'string', required: false, description: 'The playbook id that proposed this (audit).' },
    ],
  },
  {
    key: 'move_contact_stage',
    description: 'Move a CRM contact to a lifecycle stage (e.g. "advocate"). In-product, reversible, no member touch.',
    mode: 'write',
    confirmLabel: 'Move this contact',
    params: [
      { name: 'contactId', type: 'string', required: true, description: 'The contact to move.' },
      { name: 'stage', type: 'string', required: true, description: 'The stage label to set.' },
      { name: 'playbookId', type: 'string', required: false, description: 'The playbook id that proposed this (audit).' },
    ],
  },
  {
    // Resonance Engine Phase 5 (ADR-386): the value-led winback's retroactive Gem gift. A
    // modest, capped grant via lib/gems (a welcome back, not a bribe). In-product, no email.
    key: 'give_gem_gift',
    description:
      'Gift a member a small handful of Gems as part of a value-led winback (a welcome back, not a bribe). In-product, modest + capped, no member email. Use sparingly so intrinsic motivation is not crowded out.',
    mode: 'write',
    confirmLabel: 'Gift these Gems',
    params: [
      { name: 'subjectProfileId', type: 'string', required: true, description: 'The member to gift Gems to (their profile id).' },
      { name: 'amount', type: 'number', required: false, description: 'How many Gems (a small, capped amount; defaults to a modest gift).' },
      { name: 'playbookId', type: 'string', required: false, description: 'The playbook id that proposed this (audit).' },
    ],
  },
  {
    key: 'send_playbook_email',
    description:
      'DRAFT a member-facing email for a playbook (winback, nudge, invite). This NEVER sends on its own: it passes the consent send-gate and, when allowed, records the DRAFT on the timeline for a human to approve and send. Suggest only.',
    mode: 'write',
    confirmLabel: 'Approve and send this email',
    params: [
      { name: 'subjectProfileId', type: 'string', required: true, description: 'The member this email is for (their profile id, for the send-gate).' },
      { name: 'contactId', type: 'string', required: true, description: 'The CRM contact the touch is recorded against.' },
      { name: 'category', type: 'string', required: true, description: 'lifecycle | marketing (governs which consent the send-gate checks).' },
      { name: 'subject', type: 'string', required: true, description: 'The email subject line, in voice.' },
      { name: 'body', type: 'string', required: true, description: 'The full drafted email body, in voice. The human reads and approves exactly this.' },
      { name: 'playbookId', type: 'string', required: false, description: 'The playbook id that proposed this (audit).' },
    ],
  },

  // ── Resonance Graph (the reciprocal matchmaking layer · ADR-385) ─────────────
  // Two tools. suggest_resonance_match READS the consenting graph and PROPOSES the top reciprocal
  // matches (no mutation, no send). send_intro_email is OUTBOUND, suggest-only, and the hardest-gated
  // tool in the catalog: it passes the consent send-gate AND refuses to send unless BOTH parties have
  // tapped yes (the double-opt-in record). Nothing sends until both say yes.
  {
    key: 'suggest_resonance_match',
    description:
      'Suggest the strongest reciprocal resonance matches for a member: people they share a Circle, Journey, practice, or Pillar with who would also gain from meeting them. Read-only and consent-first (only opted-in people appear). Each suggestion carries a plain WHY. This proposes an intro; nothing is sent here.',
    mode: 'read',
    params: [
      { name: 'profileId', type: 'string', required: true, description: 'The member to find matches for (their profile id). They must have opted in to matching.' },
    ],
  },
  {
    key: 'send_intro_email',
    description:
      'DRAFT a warm double-opt-in intro between two members. This is the MOST gated tool: it NEVER sends unless BOTH people have tapped yes on the pairing AND the recipient passes the consent send-gate. Suggest only: Vera drafts, a human approves, and the send is refused outright until both parties have opted in. Every intro shows the plain WHY.',
    mode: 'write',
    confirmLabel: 'Send this intro',
    params: [
      { name: 'subjectProfileId', type: 'string', required: true, description: 'The recipient of this intro email (their profile id, for the send-gate).' },
      { name: 'otherProfileId', type: 'string', required: true, description: 'The other party in the pairing (their profile id). Both must have opted in before anything sends.' },
      { name: 'contactId', type: 'string', required: true, description: 'The CRM contact the touch is recorded against.' },
      { name: 'subject', type: 'string', required: true, description: 'The intro subject line, in voice.' },
      { name: 'body', type: 'string', required: true, description: 'The full drafted intro, in voice, including the plain WHY. The human reads and approves exactly this.' },
    ],
  },

  // ── Space settings (LIVE-2157, Vera assistants V3) ──────────────────────────
  // Offered ONLY on a turn whose Space guide says the caller is that Space's owner or an admin. It proposes;
  // the person taps the card; the Module Manager's own guarded action (setSpaceFeatureEnabled) re-checks
  // their authority and writes. Money, the plan, the team list and deleting are never switchable here
  // (veraSwitchable in space-guide.ts).
  {
    key: 'set_space_feature',
    description:
      'Propose turning one area of the Space they run on or off. Use only a feature key from the "Switches you may propose" list and the space slug the guide names. The person confirms on a card; nothing changes until they do.',
    mode: 'write',
    confirmLabel: 'Change this setting',
    params: [
      { name: 'space', type: 'string', required: true, description: 'The Space slug from the guide.' },
      { name: 'feature', type: 'string', required: true, description: 'A feature key from the switches list.' },
      { name: 'on', type: 'boolean', required: true, description: 'true to turn it on, false to turn it off.' },
    ],
  },
  {
    key: 'set_space_role',
    description:
      'Propose the lowest role that can use one area of the Space they run. Use only a feature key from the "Switches you may propose" list, a role from the guide\'s role ladder, and the space slug the guide names. The person confirms on a card; nothing changes until they do.',
    mode: 'write',
    confirmLabel: 'Change who can use this',
    params: [
      { name: 'space', type: 'string', required: true, description: 'The Space slug from the guide.' },
      { name: 'feature', type: 'string', required: true, description: 'A feature key from the switches list.' },
      { name: 'role', type: 'string', required: true, description: 'The lowest role: viewer, editor, moderator or admin.' },
    ],
  },
  {
    key: 'set_space_setting',
    description:
      'Propose one setting of the Space they run, from the settings list the guide names, with a value of the kind it says. The person confirms on a card; nothing changes until they do.',
    mode: 'write',
    confirmLabel: 'Change this setting',
    params: [
      { name: 'space', type: 'string', required: true, description: 'The Space slug from the guide.' },
      { name: 'setting', type: 'string', required: true, description: 'A setting id from the settings list.' },
      { name: 'value', type: 'string', required: true, description: 'The new value, of the kind the list says.' },
    ],
  },

  {
    key: 'admin_lookup',
    description: `Look up one live number for a Frequency team member, from this closed list only: ${adminQuestionList()}. Only for questions about running Frequency. Use the answer as given; if it says it could not look it up, point them to the admin page it names.`,
    mode: 'read',
    params: [{ name: 'question', type: 'string', required: true, description: 'One question id from the list.' }],
  },
  {
    key: 'set_ticket',
    description: `Propose one change to a support ticket for a Frequency team member: ${ticketChangeGuide()}. Use a ticket number they named or a lookup returned. The team member confirms on a card; nothing changes until they do.`,
    mode: 'write',
    confirmLabel: 'Change this ticket',
    params: [
      { name: 'ticket', type: 'string', required: true, description: 'The ticket number, such as 1001.' },
      { name: 'field', type: 'string', required: true, description: 'status or priority.' },
      { name: 'value', type: 'string', required: true, description: 'A value from that field list.' },
    ],
  },

  // ── Studio creation (ADR-988) ────────────────────────────────────────────────
  // The ONE governed create tool, BUILT from the Studio catalog (lib/studio/registry.ts) rather
  // than re-listed here: a tool that could name an entity the catalog does not know is exactly
  // the drift ADR-986 exists to kill, so the entity list is derived and the tool widens when a
  // manifest lands. See lib/ai/vera/create-tools.ts for the autonomy law behind it.
  //
  // Retained for authenticated human application callers. The model-facing dispatcher refuses
  // create_entity and routes to coaching; human Studio creation remains governed separately.
  createEntityToolDef(),
] as const

const BY_KEY = new Map(VERA_TOOLS.map((t) => [t.key, t]))

/** The tools the MEMBER chat (and the anonymous concierge) may offer the model (SCAN-738): the two
 *  reads and the four self-scoped writes a member can confirm. The operator playbook tools and
 *  create_entity stay in the catalog for the operator path and never reach a member turn. The
 *  member confirm action derives its allow-list from this set, so the two cannot drift. */
export const MEMBER_CHAT_TOOL_KEYS: ReadonlySet<string> = new Set([
  'suggest_circle',
  'find_host',
  'remember_fact',
  'set_profile_field',
  'draft_intro',
  'join_circle',
])

/** The Space-settings tools (LIVE-2157): offered on top of the member set only when the Space guide names
 *  them, which it does only for that Space's owner or an admin. */
export const SPACE_MANAGER_TOOL_KEYS: ReadonlySet<string> = new Set(['set_space_feature', 'set_space_role', 'set_space_setting'])

/** The operator tools (LIVE-2190, LIVE-2191): offered only when the caller's own session is staff. The lookup
 *  re-checks that before it reads, and a ticket change goes through the support console's own guarded action. */
export const OPERATOR_TOOL_KEYS: ReadonlySet<string> = new Set(['admin_lookup', 'set_ticket'])

export function getTool(key: string): VeraToolDef | undefined {
  return BY_KEY.get(key)
}

/** Write tools require an explicit member confirmation before execution. */
export function requiresConfirmation(key: string): boolean {
  return BY_KEY.get(key)?.mode === 'write'
}

interface ToolCallValidation {
  ok: boolean
  errors: string[]
}

/** Validate a proposed tool call against the catalog: known tool, required params
 *  present, provided params well-typed. The loop runs this before ever executing. */
export function validateToolCall(key: string, args: Record<string, unknown>): ToolCallValidation {
  const tool = BY_KEY.get(key)
  if (!tool) return { ok: false, errors: [`Unknown tool "${key}" — not in Vera's bounded surface.`] }

  const errors: string[] = []
  const allowed = new Set(tool.params.map((p) => p.name))
  for (const p of tool.params) {
    const v = args[p.name]
    if (v === undefined || v === null) {
      if (p.required) errors.push(`Missing required param "${p.name}".`)
      continue
    }
    if (typeof v !== p.type) errors.push(`Param "${p.name}" must be a ${p.type}.`)
  }
  for (const name of Object.keys(args)) {
    if (!allowed.has(name)) errors.push(`Unknown param "${name}" for tool "${key}".`)
  }
  return { ok: errors.length === 0, errors }
}
