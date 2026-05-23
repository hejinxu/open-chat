'use client'

import type { FC } from 'react'
import React from 'react'
import Main from '@/app/components'

interface MainEmbedProps {
  config: {
    apiKey: string
    agentId: string | null
    theme: string
    locale: string
    windowTitle: string
  }
}

const MainEmbed: FC<MainEmbedProps> = ({ config }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Main params={{ isEmbed: true, apiKey: config.apiKey }} />
      </div>
    </div>
  )
}

export default React.memo(MainEmbed)
