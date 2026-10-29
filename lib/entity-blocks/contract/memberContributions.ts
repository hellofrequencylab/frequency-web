import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE MEMBER CONTRIBUTIONS BLOCK, ADOPTED (E1). Content (the four show switches) and inspector fields come
// from the registry's own field list (./from-fields), so the schema and the inspector cannot drift.
export const memberContributionsBlock = defineBlock({
  type: 'memberContributions',
  v: 1,
  kinds: ['member'],
  reads: 'live',
  content: contentFromFields('memberContributions'),
  fields: fieldsForBlock('memberContributions'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/memberContributions.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'memberContributions'),
})
