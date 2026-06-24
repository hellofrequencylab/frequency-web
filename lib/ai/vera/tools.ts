// Vera's bounded tool surface (ADR-066, ADR-028). The COMPLETE catalog of actions
// Vera may ever take — declared up front, the same governance pattern as the trait
// registry. The conversational agent loop (a later step, gated on the consent/test
// harness per ADR-028) can call ONLY these tools, and every `write` tool requires an
// explicit member confirmation before it touches anything (propose-and-confirm).
//
// Read tools are safe (suggest/find — no mutation). Write tools propose a change the
// member must approve. There are NO autonomous writes: the model proposes, the human
// confirms, the code executes. This file is the contract that makes that enforceable.

export type ToolMode = 'read' | 'write'
export type ParamType = 'string' | 'number' | 'boolean'

export interface ToolParam {
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
      'Introduce the member to a host or member: write a short, warm introduction post in the member\'s own voice (use what they\'ve told you) and put the COMPLETE text in `message`. Once the member approves, it posts to the community feed mentioning @toHandle — the scary first hello, done.',
    mode: 'write',
    confirmLabel: 'Post this introduction',
    params: [
      { name: 'toHandle', type: 'string', required: true, description: 'Handle of the person to introduce them to.' },
      { name: 'message', type: 'string', required: true, description: 'The full drafted introduction, ready to post — the member reads and approves exactly this text.' },
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
] as const

const BY_KEY = new Map(VERA_TOOLS.map((t) => [t.key, t]))

export function getTool(key: string): VeraToolDef | undefined {
  return BY_KEY.get(key)
}

/** Write tools require an explicit member confirmation before execution. */
export function requiresConfirmation(key: string): boolean {
  return BY_KEY.get(key)?.mode === 'write'
}

export interface ToolCallValidation {
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
