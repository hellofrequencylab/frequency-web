'use client'

import { useEffect } from 'react'
import { rememberKit } from '@/lib/create-space/last-kit'

/** Renders nothing. Marks this Theme Kit as the one the visitor last looked at (lib/create-space/last-kit.ts). */
export function RememberKit({ kit }: { kit: string }) {
  useEffect(() => rememberKit(kit), [kit])
  return null
}
