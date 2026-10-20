import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE IMAGE BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const imageBlock = defineBlock({
  type: 'image',
  v: 1,
  kinds: ['member', 'space', 'email'],
  reads: 'authored',
  content: contentFromFields('image'),
  fields: fieldsForBlock('image'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/image.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'image'),
})
