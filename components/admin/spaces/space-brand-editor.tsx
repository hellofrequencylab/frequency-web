'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { isError } from '@/lib/action-result'
import type { Space } from '@/lib/spaces/types'
import { updateSpaceBranding } from '@/app/(main)/admin/spaces/actions'

// The per-Space branding form (docs/SPACES.md, ADR-249/250). A FOCUS surface: pick the
// Space's theme (a select of built-in code skins + active skin themes), set the brand name,
// accent color, and logo URL, then Save. Calls the janitor-gated updateSpaceBranding action;
// surfaces any ActionResult error inline; routes back to the list on success. Styling stays
// token-only — the ONE raw color here is the live accent preview swatch (its job is to render
// the operator's chosen hex), per ADMIN-DESIGN-SYSTEM §4.
//
// Note: the Space's chosen theme takes effect through the shell's existing `data-skin`
// resolution (the Space's `skin` selects its active theme); the VISUAL brand (logo + name in
// the header) is wired in a follow-up.

export interface SkinOption {
  slug: string
  name: string
}

const fieldClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary'
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-muted mb-1'

export function SpaceBrandEditor({ space, skins }: { space: Space; skins: SkinOption[] }) {
  const router = useRouter()
  const [skin, setSkin] = useState(space.skin)
  const [brandName, setBrandName] = useState(space.brandName ?? '')
  const [brandAccent, setBrandAccent] = useState(space.brandAccent ?? '')
  const [brandLogoUrl, setBrandLogoUrl] = useState(space.brandLogoUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // If the Space's current skin isn't an offered option (e.g. an archived theme), keep it
  // selectable so saving doesn't silently change it.
  const options = skins.some((o) => o.slug === skin)
    ? skins
    : [{ slug: skin, name: `${skin} (current)` }, ...skins]

  function save() {
    setError(null)
    start(async () => {
      const result = await updateSpaceBranding(space.id, {
        skin,
        brandName: brandName.trim() || null,
        brandAccent: brandAccent.trim() || null,
        brandLogoUrl: brandLogoUrl.trim() || null,
      })
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.push('/admin/spaces')
      router.refresh()
    })
  }

  const accentValid = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(brandAccent.trim())

  return (
    <AdminTemplate
      title={space.brandName || space.name}
      eyebrow="Operations · Tenancy"
      description={`Set the theme and brand for the “${space.name}” Space (/${space.slug}).`}
      width="narrow"
      back={{ href: '/admin/spaces', label: 'Spaces' }}
    >
      <AdminSection>
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          {/* Theme (the per-Space skin assignment — spaces.skin) */}
          <div>
            <label htmlFor="space-skin" className={labelClass}>
              Theme
            </label>
            <select
              id="space-skin"
              value={skin}
              onChange={(e) => setSkin(e.target.value)}
              className={fieldClass}
            >
              {options.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-subtle">
              The token set applied to this Space. Takes effect through the shell&rsquo;s{' '}
              <code>data-skin</code> resolution.
            </p>
          </div>

          {/* Brand name */}
          <div>
            <label htmlFor="space-brand-name" className={labelClass}>
              Brand name
            </label>
            <input
              id="space-brand-name"
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={space.name}
              maxLength={200}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-subtle">Shown in the Space header. Defaults to the Space name.</p>
          </div>

          {/* Brand accent */}
          <div>
            <label htmlFor="space-brand-accent" className={labelClass}>
              Brand accent
            </label>
            <div className="flex items-center gap-2">
              <input
                id="space-brand-accent"
                type="text"
                value={brandAccent}
                onChange={(e) => setBrandAccent(e.target.value)}
                placeholder="#3D352A"
                className={fieldClass}
              />
              {/* The ONE raw color: a live preview of the operator's chosen accent. */}
              <span
                className="h-9 w-9 shrink-0 rounded-lg border border-border"
                style={accentValid ? { backgroundColor: brandAccent.trim() } : undefined}
                aria-hidden
              />
            </div>
            <p className="mt-1 text-xs text-subtle">
              A reference swatch (hex, rgb, or hsl). The active palette still comes from the theme above.
            </p>
          </div>

          {/* Brand logo URL */}
          <div>
            <label htmlFor="space-brand-logo" className={labelClass}>
              Logo URL
            </label>
            <input
              id="space-brand-logo"
              type="text"
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              placeholder="https://… or /path/to/logo.svg"
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-subtle">An https URL or a same-origin path (starting with &ldquo;/&rdquo;).</p>
          </div>

          {error && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Save branding
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/admin/spaces')}
              disabled={pending}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Cancel
            </Button>
          </div>
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}
