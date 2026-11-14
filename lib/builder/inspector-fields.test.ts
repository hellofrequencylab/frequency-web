import { describe, expect, it } from 'vitest'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'
import { inspectorFieldViews } from './inspector-fields'

describe('inspector field views', () => {
  it('draws every Banner field the inspector can save, in contract order', () => {
    const { fields, elsewhere } = inspectorFieldViews(photoHeroBlock, 'space-site')
    const drawn = fields.map((field) => field.key)
    expect(drawn.length + elsewhere).toBe(photoHeroBlock.fields.length)
    expect(drawn).toEqual(photoHeroBlock.fields.map((field) => field.key).filter((key) => drawn.includes(key)))
    expect(fields.find((field) => field.key === 'title')).toMatchObject({ kind: 'textarea', label: 'Headline' })
    expect(fields.find((field) => field.key === 'buttonOn')).toEqual({ key: 'buttonOn', label: 'Show button', kind: 'toggle', defaultValue: true })
  })

  it('carries a segmented field its own labels and a primitive its value set', () => {
    const { fields } = inspectorFieldViews(photoHeroBlock, 'space-site')
    expect(fields.find((field) => field.key === 'display')).toMatchObject({
      kind: 'choice',
      defaultValue: 'overlay',
      options: [
        { value: 'overlay', label: 'Over photo' },
        { value: 'beside', label: 'Beside photo' },
        { value: 'below', label: 'Below photo' },
      ],
    })
    expect(fields.find((field) => field.key === 'height')).toMatchObject({ kind: 'choice', defaultValue: 'medium' })
  })

  it('draws nothing for a surface the block does not offer', () => {
    expect(inspectorFieldViews(photoHeroBlock, 'profile-inapp')).toEqual({ fields: [], elsewhere: 0 })
  })
})
