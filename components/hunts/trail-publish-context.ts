'use client'

import { createContext, useContext } from 'react'

/**
 * What the Trail editor's publish step shares with a publish control it does not own (FH-044S): the
 * release panel at app/(main)/hunts/edit/[id]/release-edition.tsx, shown instead of the first-publish
 * button when the Trail already has a published edition. The editor keeps the revision, the permission
 * confirm and the visibility; the panel reports back what the server answered.
 */
export type TrailPublishContextValue = {
  huntId: string
  revision: number
  visibility: string
  permissionConfirmed: boolean
  /** The checklist is clear, every save has landed, and no conflict is open. */
  ready: boolean
  published: boolean
  onConflict: (currentRevision: number) => void
  onBlocked: (message: string) => void
  onPublished: () => void
}

export const TrailPublishContext = createContext<TrailPublishContextValue | null>(null)

export function useTrailPublish(): TrailPublishContextValue | null {
  return useContext(TrailPublishContext)
}
