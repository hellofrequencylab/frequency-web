import { defineBlock } from '../define-block'
import { fieldsForBlock } from '../block-content'
import { contentFromFields, textOfContent } from './from-fields'

// THE IMAGE GALLERY BLOCK, ADOPTED (E1). Content and inspector fields come from the registry's own field list
// (./from-fields), so the schema and the inspector cannot drift; `check:blocks` holds the rest.
export const galleryBlock = defineBlock({
  type: 'gallery',
  v: 1,
  kinds: ['member', 'space'],
  reads: 'authored',
  content: contentFromFields('gallery'),
  fields: fieldsForBlock('gallery'),
  migrations: [],
  surfaces: {
    'profile-inapp': { density: 'standard', fields: '*' },
    'spotlight-public': { density: 'standard', fields: '*' },
    'space-profile': { density: 'standard', fields: '*' },
    'space-site': { density: 'standard', fields: '*' },
  },
  render: {
    web: () => import('@/components/entity-blocks/blocks/gallery.web'),
    email: null,
  },
  toText: (content) => textOfContent(content, 'gallery'),
})
