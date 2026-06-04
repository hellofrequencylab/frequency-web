'use client'

import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

// Copy a sequence's shareable splash URL. Resolves the path against the live
// origin at click time so it works on any environment without hardcoding a host.
export function CopyLink({ path, label = 'Copy link' }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    const url = `${window.location.origin}${path}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
      title={copied ? 'Copied!' : `Copy ${path}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  )
}
