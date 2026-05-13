'use client'

import { createContext, useContext, useEffect } from 'react'

export interface EmbedConfig {
  token: string
  agentId: string | null
  theme: string
  locale: string
  windowTitle: string
}

const EmbedConfigContext = createContext<EmbedConfig | null>(null)

export function useEmbedConfig(): EmbedConfig | null {
  return useContext(EmbedConfigContext)
}

export function EmbedConfigProvider({
  config,
  children,
}: {
  config: EmbedConfig
  children: React.ReactNode
}) {
  useEffect(() => {
    document.title = config.windowTitle || 'AI 助手'
  }, [config.windowTitle])

  return (
    <EmbedConfigContext.Provider value={config}>
      {children}
    </EmbedConfigContext.Provider>
  )
}
