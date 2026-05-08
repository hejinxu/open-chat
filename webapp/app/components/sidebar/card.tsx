import React from 'react'
import { useTranslation } from 'react-i18next'
import s from './card.module.css'

interface PropType {
  children: React.ReactNode
  text?: string
}
function Card({ children, text }: PropType) {
  const { t } = useTranslation()
  return (
    <div className={`${s.card} box-border w-full flex flex-col items-start px-4 py-3 rounded-lg border-solid border cursor-pointer hover:border-primary-300`}>
      <div className='text-content-quaternary font-medium text-xs mb-2'>{text ?? t('app.chat.powerBy')}</div>
      {children}
    </div>
  )
}

export default Card
