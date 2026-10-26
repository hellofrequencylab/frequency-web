// Model output has a narrower authority than authenticated human application actions.
// Keep the executor out of this module: even invented or replayed tool calls cannot send or create.
import type Anthropic from '@anthropic-ai/sdk'
import type { ProposedToolCall } from './concierge'
import { MEMBER_CHAT_TOOL_KEYS, requiresConfirmation, validateToolCall } from './tools'
import { executeReadTool } from './read-tools'

type ModelCall = { id: string; name: string; input: Record<string, unknown> }
const AUTHORING_REDIRECTS: Record<string, string> = {
  create_entity: 'Do not draft entity fields. Ask what the person wants to make, help them identify missing facts, and point them to the Create menu to write it themselves. Nothing was created or saved.',
  send_playbook_email: 'Do not write or send outreach. Ask the operator what outcome they want, which audience has consented, and what they want to say in their own words. They can author and review their campaign in Email Studio. Nothing was drafted or sent.',
  send_intro_email: 'Do not write or send an introduction. Ask what the people have in common and what each has agreed to share. A human must write and approve the message. Nothing was drafted or sent.',
}

export async function handleModelToolCalls(
  calls: ModelCall[],
  proposals: ProposedToolCall[],
  read: typeof executeReadTool = executeReadTool,
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
    } else if (!MEMBER_CHAT_TOOL_KEYS.has(c.name)) {
      content = 'That tool is not available in this chat.'
    } else if (!validateToolCall(c.name, c.input).ok) {
      content = 'Those arguments are not allowed. Ask a clarifying question instead. Nothing was changed.'
      continueCoaching = true
    } else if (requiresConfirmation(c.name)) {
      if (!proposals.some((p) => p.tool === c.name && JSON.stringify(p.args) === JSON.stringify(c.input))) {
        proposals.push({ tool: c.name, args: c.input })
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
