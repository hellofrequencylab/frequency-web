// Model output has a narrower authority than authenticated human application actions.
// Keep the executor out of this module: even invented or replayed tool calls cannot send or create.
import type Anthropic from '@anthropic-ai/sdk'
import type { ProposedToolCall } from './concierge'
import { MEMBER_CHAT_TOOL_KEYS, OPERATOR_TOOL_KEYS, SPACE_MANAGER_TOOL_KEYS, requiresConfirmation, validateToolCall } from './tools'
import { executeReadTool } from './read-tools'

type ModelCall = { id: string; name: string; input: Record<string, unknown> }
const AUTHORING_REDIRECTS: Record<string, string> = {
  create_entity: 'Do not draft entity fields. Ask what the person wants to make, help them identify missing facts, and point them to the Create menu to write it themselves. Nothing was created or saved.',
  send_playbook_email: 'Do not write or send outreach. Ask the operator what outcome they want, which audience has consented, and what they want to say in their own words. They can author and review their campaign in Email Studio. Nothing was drafted or sent.',
  send_intro_email: 'Do not write or send an introduction. Ask what the people have in common and what each has agreed to share. A human must write and approve the message. Nothing was drafted or sent.',
}

/** The Space-settings check (LIVE-2157), handed in by the caller so this chokepoint never loads the Space
 *  catalog. Absent means no Space switch may be proposed on this turn. */
interface SpaceSwitches {
  switchable: (feature: string) => boolean
  card: (feature: string, on: boolean) => string
  /** The card words for a lowest-role change (LIVE-2185), or null for a role the ladder does not have. */
  roleCard?: (feature: string, role: string) => string | null
  /** The card words for a Space setting (LIVE-2186), or null for a setting or value Vera may not propose. */
  settingCard?: (setting: string, value: unknown) => string | null
  /** The operator lookup (LIVE-2190), present only when the caller's session is staff. It re-checks that itself. */
  lookup?: (question: unknown) => Promise<string>
  /** The card words for a support ticket change (LIVE-2191), present only with the lookup. */
  ticketCard?: (ticket: unknown, field: unknown, value: unknown) => string | null
}

export async function handleModelToolCalls(
  calls: ModelCall[],
  proposals: ProposedToolCall[],
  read: typeof executeReadTool = executeReadTool,
  space?: SpaceSwitches,
): Promise<Anthropic.ToolResultBlockParam[] | null> {
  let continueCoaching = false
  const results: Anthropic.ToolResultBlockParam[] = []
  for (const c of calls) {
    let content: string
    if (!c.input || typeof c.input !== 'object' || Array.isArray(c.input)) {
      content = 'Those arguments are not allowed. Ask a clarifying question instead. Nothing was changed.'
      continueCoaching = true
    } else if (c.name === 'set_profile_field' && c.input.field === 'bio') {
      content = 'Do not write or save a bio. Ask what the member would like people to know, then point them to /settings/profile to write it themselves. Nothing was saved.'
      continueCoaching = true
    } else if (Object.hasOwn(AUTHORING_REDIRECTS, c.name)) {
      content = AUTHORING_REDIRECTS[c.name]
      continueCoaching = true
    } else if (!MEMBER_CHAT_TOOL_KEYS.has(c.name) && !SPACE_MANAGER_TOOL_KEYS.has(c.name) && !OPERATOR_TOOL_KEYS.has(c.name)) {
      content = 'That tool is not available in this chat.'
    } else if (!validateToolCall(c.name, c.input).ok) {
      content = 'Those arguments are not allowed. Ask a clarifying question instead. Nothing was changed.'
      continueCoaching = true
    } else if (c.name === 'set_space_feature' && !space?.switchable(String(c.input.feature))) {
      content = 'That setting cannot be changed from this chat. Tell them exactly where to change it. Nothing was changed.'
      continueCoaching = true
    } else if (c.name === 'set_space_role' && !(space?.switchable(String(c.input.feature)) && space.roleCard?.(String(c.input.feature), String(c.input.role)))) {
      content = 'That setting cannot be changed from this chat. Tell them exactly where to change it. Nothing was changed.'
      continueCoaching = true
    } else if (c.name === 'set_space_setting' && !space?.settingCard?.(String(c.input.setting), c.input.value)) {
      content = 'That setting or value cannot be changed from this chat. Tell them exactly where to change it. Nothing was changed.'
      continueCoaching = true
    } else if (c.name === 'admin_lookup') {
      content = space?.lookup ? await space.lookup(c.input.question) : 'That lookup is for the Frequency team only. Nothing was read.'
      continueCoaching = true
    } else if (c.name === 'set_ticket' && !space?.ticketCard?.(c.input.ticket, c.input.field, c.input.value)) {
      content = 'That ticket change cannot be made from this chat. Point them to /admin/support. Nothing was changed.'
      continueCoaching = true
    } else if (requiresConfirmation(c.name)) {
      if (!proposals.some((p) => p.tool === c.name && JSON.stringify(p.args) === JSON.stringify(c.input))) {
        // A Space switch carries its card words from the catalog, so the page never ships the catalog.
        const label =
          c.name === 'set_space_feature'
            ? space?.card(String(c.input.feature), c.input.on === true)
            : c.name === 'set_space_role'
              ? (space?.roleCard?.(String(c.input.feature), String(c.input.role)) ?? undefined)
              : c.name === 'set_space_setting'
                ? (space?.settingCard?.(String(c.input.setting), c.input.value) ?? undefined)
                : c.name === 'set_ticket'
                  ? (space?.ticketCard?.(c.input.ticket, c.input.field, c.input.value) ?? undefined)
                  : undefined
        proposals.push(label ? { tool: c.name, args: c.input, label } : { tool: c.name, args: c.input })
      }
      content = 'Proposed to the member for confirmation.'
    } else {
      content = await read(c.name, c.input)
      continueCoaching = true
    }
    results.push({ type: 'tool_result', tool_use_id: c.id, content })
  }
  return continueCoaching ? results : null
}
