import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE TOP FRIENDS BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const topfriendsBlock = defineBlock({
  type: 'topfriends',
  v: 1,
  kinds: ['member'],
  reads: 'live',
  content: contentFromFields('topfriends'),
  fields: fieldsForBlock('topfriends'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/topfriends.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'topfriends'),
})
