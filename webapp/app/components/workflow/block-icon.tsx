import type { FC } from 'react'
import { memo } from 'react'
import { BlockEnum } from '@/types/app'
import {
  Answer,
  Code,
  End,
  Home,
  Http,
  IfElse,
  KnowledgeRetrieval,
  Llm,
  QuestionClassifier,
  TemplatingTransform,
  VariableX,
} from '@/app/components/base/icons/workflow'
import AppIcon from '@/app/components/base/app-icon'

interface BlockIconProps {
  type: BlockEnum | string
  size?: string
  className?: string
  toolIcon?: string | { content: string, background: string }
}
const ICON_CONTAINER_CLASSNAME_SIZE_MAP: Record<string, string> = {
  xs: 'w-4 h-4 rounded-[5px] shadow-xs',
  sm: 'w-5 h-5 rounded-md shadow-xs',
  md: 'w-6 h-6 rounded-lg shadow-md',
}
const getIcon = (type: BlockEnum | string, className: string) => {
  const iconMap: Record<string, JSX.Element> = {
    [BlockEnum.Start]: <Home className={className} />,
    [BlockEnum.LLM]: <Llm className={className} />,
    [BlockEnum.Code]: <Code className={className} />,
    [BlockEnum.End]: <End className={className} />,
    [BlockEnum.IfElse]: <IfElse className={className} />,
    [BlockEnum.HttpRequest]: <Http className={className} />,
    [BlockEnum.Answer]: <Answer className={className} />,
    [BlockEnum.KnowledgeRetrieval]: <KnowledgeRetrieval className={className} />,
    [BlockEnum.QuestionClassifier]: <QuestionClassifier className={className} />,
    [BlockEnum.TemplateTransform]: <TemplatingTransform className={className} />,
    [BlockEnum.VariableAssigner]: <VariableX className={className} />,
    [BlockEnum.VariableExtractor]: <VariableX className={className} />,
    [BlockEnum.Variable]: <VariableX className={className} />,
    [BlockEnum.Parameter]: <VariableX className={className} />,
    [BlockEnum.ParameterExtractor]: <VariableX className={className} />,
    [BlockEnum.Assigner]: <VariableX className={className} />,
    [BlockEnum.Extractor]: <VariableX className={className} />,
    [BlockEnum.VariableConfig]: <VariableX className={className} />,
    [BlockEnum.EnvConfig]: <VariableX className={className} />,
    [BlockEnum.EnvironmentVariable]: <VariableX className={className} />,
    [BlockEnum.Env]: <VariableX className={className} />,
    [BlockEnum.Tool]: <VariableX className={className} />,
  }
  return iconMap[type] || <VariableX className={className} />
}
const ICON_CONTAINER_BG_COLOR_MAP: Record<string, string> = {
  [BlockEnum.Start]: 'bg-[#2970FF]',
  [BlockEnum.LLM]: 'bg-[#6172F3]',
  [BlockEnum.Code]: 'bg-[#2E90FA]',
  [BlockEnum.End]: 'bg-[#F79009]',
  [BlockEnum.IfElse]: 'bg-[#06AED4]',
  [BlockEnum.HttpRequest]: 'bg-[#875BF7]',
  [BlockEnum.Answer]: 'bg-[#F79009]',
  [BlockEnum.KnowledgeRetrieval]: 'bg-[#16B364]',
  [BlockEnum.QuestionClassifier]: 'bg-[#16B364]',
  [BlockEnum.TemplateTransform]: 'bg-[#2E90FA]',
  [BlockEnum.VariableAssigner]: 'bg-[#2E90FA]',
  [BlockEnum.VariableExtractor]: 'bg-[#2E90FA]',
  [BlockEnum.Variable]: 'bg-[#2E90FA]',
  [BlockEnum.Parameter]: 'bg-[#2E90FA]',
  [BlockEnum.ParameterExtractor]: 'bg-[#2E90FA]',
  [BlockEnum.Assigner]: 'bg-[#2E90FA]',
  [BlockEnum.Extractor]: 'bg-[#2E90FA]',
  [BlockEnum.VariableConfig]: 'bg-[#2E90FA]',
  [BlockEnum.EnvConfig]: 'bg-[#2E90FA]',
  [BlockEnum.EnvironmentVariable]: 'bg-[#2E90FA]',
  [BlockEnum.Env]: 'bg-[#2E90FA]',
  [BlockEnum.Tool]: 'bg-[#2E90FA]',
}
const BlockIcon: FC<BlockIconProps> = ({
  type,
  size = 'sm',
  className,
  toolIcon,
}) => {
  const isTool = (typeof type === 'string' && type === BlockEnum.Tool)
  return (
    <div className={`
      flex items-center justify-center border-[0.5px] border-white/[0.02] text-white
      ${ICON_CONTAINER_CLASSNAME_SIZE_MAP[size]} 
      ${ICON_CONTAINER_BG_COLOR_MAP[type] || 'bg-[#2E90FA]'}
      ${toolIcon && '!shadow-none'}
      ${className}
    `}
    >
      {
        !isTool && (
          getIcon(type, size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5')
        )
      }
      {
        isTool && toolIcon && (
          <>
            {
              typeof toolIcon === 'string'
                ? (
                  <div
                    className='shrink-0 w-full h-full bg-cover bg-center rounded-md'
                    style={{
                      backgroundImage: `url(${toolIcon})`,
                    }}
                  ></div>
                )
                : (
                  <AppIcon
                    className='shrink-0 !w-full !h-full'
                    size='tiny'
                    icon={toolIcon?.content}
                    background={toolIcon?.background}
                  />
                )
            }
          </>
        )
      }
    </div>
  )
}

export const VarBlockIcon: FC<BlockIconProps> = ({
  type,
  className,
}) => {
  return (
    <>
      {getIcon(type, `w-3 h-3 ${className}`)}
    </>
  )
}

export default memo(BlockIcon)
