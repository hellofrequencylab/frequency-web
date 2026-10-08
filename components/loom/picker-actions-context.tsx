'use client'
import { createContext, useContext, type ReactNode } from 'react'
import type { loomScopes, loomScope, loomImages, uploadLoomImage } from '@/lib/loom/picker-actions'
export interface LoomPickerActions {
  scopes: typeof loomScopes
  scope: typeof loomScope
  images: typeof loomImages
  upload: typeof uploadLoomImage
}
const Context = createContext<LoomPickerActions | null>(null)
export function LoomPickerActionsProvider({ actions, children }: { actions: LoomPickerActions; children: ReactNode }) {
  return <Context.Provider value={actions}>{children}</Context.Provider>
}
export function useLoomPickerActions() { return useContext(Context) }
