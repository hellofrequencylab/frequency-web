import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE EDITORIAL SECTION BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const editorialBlock = defineBlock({
  type: 'editorial',
  v: 1,
  kinds: ['space', 'email'],
  reads: 'authored',
  content: contentFromFields('editorial'),
  fields: fieldsForBlock('editorial'),
  migrations: [],
  surfaces: {
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/editorial.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'editorial'),
})
