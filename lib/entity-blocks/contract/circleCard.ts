import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE CIRCLE BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const circleCardBlock = defineBlock({
  type: 'circleCard',
  v: 1,
  kinds: ['email'],
  reads: 'live',
  resolveAt: 'send',
  content: contentFromFields('circleCard'),
  fields: fieldsForBlock('circleCard'),
  migrations: [],
  surfaces: {
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/circleCard.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'circleCard'),
})
