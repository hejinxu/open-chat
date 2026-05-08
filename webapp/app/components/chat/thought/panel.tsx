'use client'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  isRequest: boolean
  toolName: string
  content: string
}

const Panel: FC<Props> = ({
  isRequest,
  toolName,
  content,
}) => {
  const { t } = useTranslation()

  return (
    <div className='rounded-md bg-surface-tertiary overflow-hidden border border-border-subtle'>
      <div className='flex items-center px-2 py-1 leading-[18px] bg-surface-secondary uppercase text-xs font-medium text-content-tertiary'>
        {t(`tools.thought.${isRequest ? 'requestTitle' : 'responseTitle'}`)} {toolName}
      </div>
      <div className='p-2 border-t border-border-subtle leading-4 text-xs text-content-secondary'>{content}</div>
    </div>
  )
}
export default React.memo(Panel)
