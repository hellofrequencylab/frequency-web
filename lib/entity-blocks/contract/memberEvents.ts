import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE MEMBER EVENTS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const memberEventsBlock = defineBlock({
  type: 'memberEvents',
  v: 1,
  kinds: ['member'],
  reads: 'live',
  content: contentFromFields('memberEvents'),
  fields: fieldsForBlock('memberEvents'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/memberEvents.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'memberEvents'),
})
