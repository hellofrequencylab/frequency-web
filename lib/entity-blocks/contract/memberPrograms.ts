import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE MEMBER PROGRAMS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const memberProgramsBlock = defineBlock({
  type: 'memberPrograms',
  v: 1,
  kinds: ['member'],
  reads: 'live',
  content: contentFromFields('memberPrograms'),
  fields: fieldsForBlock('memberPrograms'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/memberPrograms.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'memberPrograms'),
})
