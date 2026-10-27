'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { NavViewer } from '@/lib/nav/registry'

const SearchOverlay = dynamic(() => import('@/components/search/search-overlay').then((m) => m.SearchOverlay), { ssr: false })

/** The active Frequency header's search seam, including requests made before its chunk loads. */
export function MemberSearch({ viewer }: { viewer: NavViewer }) {
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      // Also cancel an outstanding request before the overlay's own Escape listener exists.
      if (event.key === 'Escape') setSearchOpen(false)
    }
    const onOpen = () => setSearchOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-search', onOpen)
    }
  }, [])
  return searchOpen ? <SearchOverlay onClose={() => setSearchOpen(false)} viewer={viewer} /> : null
}
