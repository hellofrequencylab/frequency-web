'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'

// Optimize only our public storage objects. Keep legacy, signed, and external URLs on the
// existing direct-render path instead of proxying them through a new party or breaking them.
function canOptimizePostImage(src: string): boolean {
  try {
    const url = new URL(src)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash &&
      (url.hostname === 'api.frequencylocal.com' || url.hostname === 'azsqfeonabsbmemvddqd.supabase.co') &&
      url.pathname.startsWith('/storage/v1/object/public/') && !url.pathname.toLowerCase().endsWith('.svg')
  } catch {
    return false
  }
}

export function PostPhoto({ src, className = '', children, label }: { src: string; className?: string; children?: ReactNode; label?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const optimized = canOptimizePostImage(src) && failedSrc !== src
  return (
    <span className={`ph ${className}`} role={label ? 'img' : undefined} aria-label={label} style={optimized ? { position: 'relative', overflow: 'hidden' } : { backgroundImage: `url("${src}")` }}>
      {optimized && <Image src={src} alt="" fill sizes="(max-width: 720px) 100vw, 700px" style={{ objectFit: 'cover' }} onError={() => setFailedSrc(src)} />}
      {children}
    </span>
  )
}
