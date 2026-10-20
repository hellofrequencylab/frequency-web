import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE EVENTS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const eventsBlock = defineBlock({
  type: 'events',
  v: 1,
  kinds: ['space'],
  reads: 'live',
  content: contentFromFields('events'),
  fields: fieldsForBlock('events'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/events.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'events'),
})
