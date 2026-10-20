import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE BUSINESS PRESENCE BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const businessBlock = defineBlock({
  type: 'business',
  v: 1,
  kinds: ['space'],
  reads: 'live',
  content: contentFromFields('business'),
  fields: fieldsForBlock('business'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/business.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'business'),
})
