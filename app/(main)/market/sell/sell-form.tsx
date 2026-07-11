'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { COMMERCE_CATEGORIES, normalizeTags } from '@/lib/commerce/categories'
import { createMakerProductAction } from '../../marketplace/commerce-actions'

// The maker "List a product" form (Etsy-Grade Phase 1). A client island so it can carry the multi-photo
// gallery, the controlled category picker, and the tag chip input; it still submits straight to the
// createMakerProductAction server action (which parses the FormData and redirects). Photos upload to the
// public event-media bucket under the signer's own uid prefix and ride as a JSON array of storage PATHS
// in a hidden field; tags ride the same way. No em or en dashes.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export function SellForm() {
  const [images, setImages] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')

  function commitTags(next: string) {
    const merged = normalizeTags([...tags, ...next.split(',')])
    setTags(merged)
    setTagDraft('')
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (tagDraft.trim()) commitTags(tagDraft)
    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1))
    }
  }

  return (
    <form action={createMakerProductAction} className="space-y-6">
      {/* Ordered storage paths + tags ride as JSON in hidden fields the action parses. */}
      <input type="hidden" name="images" value={JSON.stringify(images)} />
      <input type="hidden" name="tags" value={JSON.stringify(tags)} />

      <div>
        <label htmlFor="title" className={LABEL}>
          What are you selling?
        </label>
        <input id="title" name="title" required maxLength={200} className={FIELD} placeholder="e.g. Hand-thrown ceramic mug" />
      </div>

      {/* Photos — the cover is the first tile; drag or use the arrows to reorder. */}
      <MultiImageUpload
        label="Photos"
        value={images}
        onChange={setImages}
        folder="commerce-gallery"
        max={8}
        reorderable
        hint="Add up to 8. The first photo is the cover buyers see first."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className={LABEL}>
            Price (USD)
          </label>
          <input id="price" name="price" type="number" min="0" step="0.01" inputMode="decimal" required className={FIELD} placeholder="e.g. 28" />
        </div>
        <div>
          <label htmlFor="category" className={LABEL}>
            Category (optional)
          </label>
          <select id="category" name="category" defaultValue="" className={FIELD}>
            <option value="">Choose a category</option>
            {COMMERCE_CATEGORIES.map((c) => (
              <optgroup key={c.value} label={c.label}>
                <option value={c.value}>{c.label} (general)</option>
                {c.subcategories.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="condition" className={LABEL}>
          Condition
        </label>
        {/* R3: individuals may list Used only. New is a Business feature, so it is disabled here and
            rejected server-side (fail-closed) in createMakerProductAction. */}
        <select id="condition" name="condition" defaultValue="used" className={FIELD}>
          <option value="used">Used</option>
          <option value="new" disabled>
            New (Business accounts only)
          </option>
        </select>
        <p className="mt-1 text-xs text-subtle">
          Individuals list used items.{' '}
          <Link href="/spaces/new" className="font-medium text-primary-strong hover:underline">
            Go Business to sell new products
          </Link>
          .
        </p>
      </div>

      {/* Tags — free-form keywords buyers search by, alongside the category above. */}
      <div>
        <label htmlFor="tag-input" className={LABEL}>
          Tags (optional)
        </label>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-primary">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text">
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                aria-label={`Remove tag ${t}`}
                className="text-muted transition-colors hover:text-text"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            id="tag-input"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={() => tagDraft.trim() && commitTags(tagDraft)}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-text outline-none"
            placeholder={tags.length ? 'Add another' : 'e.g. ceramic, handmade, mug'}
          />
        </div>
        <p className="mt-1 text-xs text-subtle">Press Enter or comma to add a tag. Up to 12.</p>
      </div>

      <div>
        <label htmlFor="description" className={LABEL}>
          Details
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={2000}
          className={FIELD}
          placeholder="Materials, size, how it's made, shipping or pickup."
        />
      </div>
      <p className="text-xs text-subtle">
        Payouts run on Stripe Connect, so the money goes straight to you. Set up a payout account
        before your first sale; the platform fee stays low.
      </p>
      <div className="flex justify-end">
        <button type="submit" className={buttonClasses('primary', 'md')}>
          List it
        </button>
      </div>
    </form>
  )
}
