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
    description: 'Draft a warm introduction to a host or member for the member to send.',
    mode: 'write',
    confirmLabel: 'Send this introduction',
    params: [
      { name: 'toHandle', type: 'string', required: true, description: 'Handle of the person to introduce.' },
      { name: 'note', type: 'string', required: false, description: 'An optional personal note.' },
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
