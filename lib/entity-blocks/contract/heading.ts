import { z } from 'zod'
import { defineBlock } from '../define-block'
import { fieldsForBlock, inlineHtmlToText } from '../block-content'

// THE HEADING BLOCK, ADOPTED (E1 pilot, docs/EDITOR-ARCHITECTURE.md §3). The content model is the one the
// editor already stores for this block: a single inline-rich `text`. The field metadata is the registry's
// own, so the inspector and the schema cannot drift (`check:blocks` holds their keys equal).
export const headingBlock = defineBlock({
  type: 'heading',
  v: 1,
  kinds: ['member', 'space', 'email'],
  reads: 'authored',
  content: z.object({ text: z.string().max(2000).optional() }),
  fields: fieldsForBlock('heading'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: { web: () => import('@/components/entity-blocks/blocks/heading.web'), email: 'registered' },
  toText: (content) => inlineHtmlToText(content.text).replace(/\s*\n\s*/g, ' '),
})
