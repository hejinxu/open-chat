import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import cn from 'classnames'
import NodePanel from './node'
import type { WorkflowProcess } from '@/types/app'
import CheckCircle from '@/app/components/base/icons/solid/general/check-circle'
import AlertCircle from '@/app/components/base/icons/solid/alert-circle'
import Loading02 from '@/app/components/base/icons/line/loading-02'
import ChevronRight from '@/app/components/base/icons/line/chevron-right'
import { WorkflowRunningStatus } from '@/types/app'
import { useThemeContext } from '@/app/components/theme-provider'

interface WorkflowProcessProps {
  data: WorkflowProcess
  grayBg?: boolean
  expand?: boolean
  hideInfo?: boolean
}
const WorkflowProcessItem = ({
  data,
  grayBg,
  expand = false,
  hideInfo = false,
}: WorkflowProcessProps) => {
  const [collapse, setCollapse] = useState(!expand)
  const running = data.status === WorkflowRunningStatus.Running
  const succeeded = data.status === WorkflowRunningStatus.Succeeded
  const failed = data.status === WorkflowRunningStatus.Failed || data.status === WorkflowRunningStatus.Stopped
  const { resolvedTheme } = useThemeContext()

  const lightBackground = useMemo(() => {
    if (running && !collapse) { return 'linear-gradient(180deg, #E1E4EA 0%, #EAECF0 100%)' }

    if (succeeded && !collapse) { return 'linear-gradient(180deg, #ECFDF3 0%, #F6FEF9 100%)' }

    if (failed && !collapse) { return 'linear-gradient(180deg, #FEE4E2 0%, #FEF3F2 100%)' }
  }, [running, succeeded, failed, collapse])

  const darkBackground = useMemo(() => {
    if (running && !collapse) { return 'linear-gradient(180deg, #374151 0%, #4B5563 100%)' }

    if (succeeded && !collapse) { return 'linear-gradient(180deg, #064E3B 0%, #065F46 100%)' }

    if (failed && !collapse) { return 'linear-gradient(180deg, #7F1D1D 0%, #991B1B 100%)' }
  }, [running, succeeded, failed, collapse])

  const techBlueBackground = useMemo(() => {
    if (running && !collapse) { return 'linear-gradient(180deg, rgba(42, 77, 110, 0.8) 0%, rgba(30, 53, 84, 0.85) 100%)' }

    if (succeeded && !collapse) { return 'linear-gradient(180deg, rgba(6, 78, 59, 0.6) 0%, rgba(6, 95, 70, 0.6) 100%)' }

    if (failed && !collapse) { return 'linear-gradient(180deg, rgba(127, 29, 29, 0.6) 0%, rgba(153, 27, 27, 0.6) 100%)' }
  }, [running, succeeded, failed, collapse])

  useEffect(() => {
    setCollapse(!expand)
  }, [expand])

  const currentBackground = resolvedTheme === 'dark' ? darkBackground : resolvedTheme === 'tech-blue' ? techBlueBackground : lightBackground

  return (
    <div
      className={cn(
        'mb-2 rounded-xl border-[0.5px] border-border-subtle',
        collapse ? 'py-[7px]' : hideInfo ? 'pt-2 pb-1' : 'py-2',
        collapse && (!grayBg ? 'bg-surface' : 'bg-surface'),
        hideInfo ? 'mx-1 px-1' : 'w-full px-3',
      )}
      style={{
        background: currentBackground,
      }}
    >
      <div
        className={cn(
          'flex items-center h-[18px] cursor-pointer',
          hideInfo && 'px-[6px]',
        )}
        onClick={() => setCollapse(!collapse)}
      >
        {
          running && (
            <Loading02 className='shrink-0 mr-1 w-3 h-3 text-[#667085] text-content-tertiary animate-spin' />
          )
        }
        {
          succeeded && (
            <CheckCircle className='shrink-0 mr-1 w-3 h-3 text-[#12B76A]' />
          )
        }
        {
          failed && (
            <AlertCircle className='shrink-0 mr-1 w-3 h-3 text-[#F04438]' />
          )
        }
        <div className='grow text-xs font-medium text-content-secondary leading-[18px]'>Workflow Process</div>
        <ChevronRight className={`'ml-1 w-3 h-3 text-content-tertiary' ${collapse ? '' : 'rotate-90'}`} />
      </div>
      {
        !collapse && (
          <div className='mt-1.5'>
            {
              data.tracing.map(node => (
                <div key={node.id} className='mb-0.5 last-of-type:mb-0'>
                  <NodePanel
                    nodeInfo={node}
                    hideInfo={hideInfo}
                  />
                </div>
              ))
            }
          </div>
        )
      }
    </div>
  )
}

export default WorkflowProcessItem
