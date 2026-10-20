import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE FAQ BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const faqBlock = defineBlock({
  type: 'faq',
  v: 1,
  kinds: ['space'],
  reads: 'live',
  content: contentFromFields('faq'),
  fields: fieldsForBlock('faq'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/faq.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'faq'),
})
