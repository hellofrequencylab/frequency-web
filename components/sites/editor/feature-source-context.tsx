'use client'

import { createContext, useContext } from 'react'

export const WebsiteFeatureSourceContext = createContext<{ load: (blockId: string, source: string) => Promise<void>; error: string | null }>({ load: async () => {}, error: null })
export const useWebsiteFeatureSource = () => useContext(WebsiteFeatureSourceContext)
