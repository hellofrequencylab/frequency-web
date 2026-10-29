import { describe, expect, it } from 'vitest'
import { subjectColumns } from './plan-subject'

describe('subjectColumns', () => {
  it('writes a Plan subject', () => {
    expect(subjectColumns({ planId: 'p1' })).toEqual({ plan_id: 'p1', entry_id: null })
  })

  it('writes an entry subject', () => {
    expect(subjectColumns({ entryId: 'e1' })).toEqual({ plan_id: null, entry_id: 'e1' })
  })

  it('refuses a subject that names neither, matching the database CHECK', () => {
    expect(subjectColumns({})).toBeNull()
    expect(subjectColumns({ planId: null, entryId: null })).toBeNull()
    expect(subjectColumns({ planId: '', entryId: '' })).toBeNull()
  })

  it('refuses a subject that names both', () => {
    expect(subjectColumns({ planId: 'p1', entryId: 'e1' })).toBeNull()
  })
})
