import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE BUTTON BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const buttonBlock = defineBlock({
  type: 'button',
  v: 1,
  kinds: ['member', 'space', 'email'],
  reads: 'authored',
  content: contentFromFields('button'),
  fields: fieldsForBlock('button'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
    email: { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/button.web'),
    email: 'registered',
  },
  toText: (content) => textOfContent(content, 'button'),
})
