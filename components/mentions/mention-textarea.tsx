'use client'

import { useRef, type TextareaHTMLAttributes } from 'react'
import { Textarea } from '@/components/ui/field'
import { useTagPicker, type MentionPerson } from './use-tag-picker'

export { tagLabel, type MentionPerson } from './use-tag-picker'

// A MESSAGE BOX THAT TAGS PEOPLE WITH @ AND LINKS ITEMS WITH # (LIVE-2524, LIVE-2525). The plain
// textarea with the shared picker attached. With the list closed, Enter is a new line as before, so
// a box inside a form never submits it.

export function MentionTextarea({
  value,
  onValueChange,
  people,
  items = true,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (next: string) => void
  people: readonly MentionPerson[]
  items?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const picker = useTagPicker({ inputRef: ref, value, onValueChange, people, items })
  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={ref}
        value={value}
        role="combobox"
        aria-expanded={picker.open}
        aria-autocomplete="list"
        onChange={(e) => {
          onValueChange(e.target.value)
          picker.readCaret(e.target.value)
        }}
        onKeyDown={picker.onKeyDown}
        onBlur={picker.onBlur}
      />
      {picker.list}
    </div>
  )
}
