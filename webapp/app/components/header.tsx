import type { FC } from 'react'
import React from 'react'
import {
  Bars3Icon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid'
export interface IHeaderProps {
  isMobile?: boolean
  onShowSideBar?: () => void
  onCreateNewChat?: () => void
}
const Header: FC<IHeaderProps> = ({
  isMobile,
  onShowSideBar,
  onCreateNewChat,
}) => {
  if (!isMobile) { return null }
  return (
    <div className="shrink-0 flex items-center justify-between h-12 px-3 bg-surface relative z-10">
      <div
        className='flex items-center justify-center h-8 w-8 cursor-pointer'
        onClick={() => onShowSideBar?.()}
      >
        <Bars3Icon className="h-4 w-4 text-content-tertiary" />
      </div>
      <div></div>
      <div className='flex items-center gap-2'>
        <div className='flex items-center justify-center h-8 w-8 cursor-pointer' onClick={() => onCreateNewChat?.()} >
          <PencilSquareIcon className="h-4 w-4 text-content-tertiary" />
        </div>
      </div>
    </div>
  )
}

export default React.memo(Header)
