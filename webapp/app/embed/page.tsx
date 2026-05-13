'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import type { EmbedConfig } from './embed-config'
import { EmbedConfigProvider } from './embed-config'
import MainEmbed from './main-embed'

function EmbedContent() {
  const searchParams = useSearchParams()

  const config: EmbedConfig = {
    token: searchParams.get('token') || '',
    agentId: searchParams.get('agentId') || null,
    theme: searchParams.get('theme') || 'light',
    locale: searchParams.get('locale') || 'zh-Hans',
    windowTitle: searchParams.get('title') || 'AI 助手',
  }

  const [themeApplied, setThemeApplied] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add(config.theme)
    setThemeApplied(true)
    return () => {
      document.documentElement.classList.remove(config.theme)
    }
  }, [config.theme])

  if (!themeApplied) {
    return null
  }

  return (
    <EmbedConfigProvider config={config}>
      <MainEmbed config={config} />
    </EmbedConfigProvider>
  )
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-content-accent border-t-transparent rounded-full animate-spin" /></div>}>
      <EmbedContent />
    </Suspense>
  )
}
