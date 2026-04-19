'use client'
import type { FC } from 'react'
import React, { useEffect, useRef } from 'react'
import cn from 'classnames'
import { useTranslation } from 'react-i18next'
import Textarea from 'rc-textarea'
import s from './style.module.css'
import Answer from './answer'
import Question from './question'
import type { FeedbackFunc } from './type'
import type { ChatItem, VisionFile, VisionSettings } from '@/types/app'
import { TransferMethod } from '@/types/app'
import Tooltip from '@/app/components/base/tooltip'
import Toast from '@/app/components/base/toast'
import ChatImageUploader from '@/app/components/base/image-uploader/chat-image-uploader'
import { useImageFiles } from '@/app/components/base/image-uploader/hooks'
import FileUploaderInAttachmentWrapper from '@/app/components/base/file-uploader-in-attachment'
import type { FileEntity, FileUpload } from '@/app/components/base/file-uploader-in-attachment/types'
import { getProcessedFiles } from '@/app/components/base/file-uploader-in-attachment/utils'
import { VoiceInput } from './voice-input'
import { setAutoReadPending, triggerAutoReadIfPending } from './text-to-speech'
import { VOICE_INPUT_CONFIG } from '@/config/voice-input'
import { VoiceSettings } from './voice-settings'

export interface IChatProps {
  chatList: ChatItem[]
  /**
   * Whether to display the editing area and rating status
   */
  feedbackDisabled?: boolean
  /**
   * Whether to display the input area
   */
  isHideSendInput?: boolean
  onFeedback?: FeedbackFunc
  onRegenerate?: (id: string) => void
  checkCanSend?: () => boolean
  onSend?: (message: string, files: VisionFile[]) => void
  useCurrentUserAvatar?: boolean
  isResponding?: boolean
  onStopResponding?: () => void
  controlClearQuery?: number
  visionConfig?: VisionSettings
  fileConfig?: FileUpload
}

const Chat: FC<IChatProps> = ({
  chatList,
  feedbackDisabled = false,
  isHideSendInput = false,
  onFeedback,
  onRegenerate,
  checkCanSend,
  onSend = () => { },
  useCurrentUserAvatar,
  isResponding,
  onStopResponding,
  controlClearQuery,
  visionConfig,
  fileConfig,
}) => {
  const { t } = useTranslation()
  const { notify } = Toast
  const isUseInputMethod = useRef(false)

  const [query, setQuery] = React.useState('')
  const queryRef = useRef('')
  const [autoStopOnTimeout, setAutoStopOnTimeout] = React.useState(true)
  const [autoSendOnTimeout, setAutoSendOnTimeout] = React.useState(VOICE_INPUT_CONFIG.AUTO_SEND_ON_TIMEOUT)
  const [autoReadAloud, setAutoReadAloud] = React.useState(VOICE_INPUT_CONFIG.AUTO_READ_ALOUD)
  const [timeoutMs, setTimeoutMs] = React.useState(VOICE_INPUT_CONFIG.TIMEOUT_MS)
  const voiceInputRef = React.useRef<{ stop: () => void }>(null)

  const prevIsRespondingRef = useRef(false)
  const hasReadAloudRef = useRef(false)

  useEffect(() => {
    if (autoReadAloud) {
      if (prevIsRespondingRef.current && !isResponding) {
        const lastItem = chatList[chatList.length - 1]
        if (lastItem?.isAnswer && lastItem?.content && !hasReadAloudRef.current) {
          triggerAutoReadIfPending(lastItem.content)
          hasReadAloudRef.current = true
        }
      }
      if (isResponding) {
        hasReadAloudRef.current = false
      }
    }
    prevIsRespondingRef.current = !!isResponding
  }, [isResponding, chatList, autoReadAloud])

  const handleContentChange = (e: any) => {
    const value = e.target.value
    setQuery(value)
    queryRef.current = value
  }

  const logError = (message: string) => {
    notify({ type: 'error', message, duration: 3000 })
  }

  const valid = () => {
    const query = queryRef.current
    if (!query || query.trim() === '') {
      logError(t('app.errorMessage.valueOfVarRequired'))
      return false
    }
    return true
  }

  useEffect(() => {
    if (controlClearQuery) {
      setQuery('')
      queryRef.current = ''
    }
  }, [controlClearQuery])
  const {
    files,
    onUpload,
    onRemove,
    onReUpload,
    onImageLinkLoadError,
    onImageLinkLoadSuccess,
    onClear,
  } = useImageFiles()

  const [attachmentFiles, setAttachmentFiles] = React.useState<FileEntity[]>([])

  const handleSend = () => {
    if (!valid() || (checkCanSend && !checkCanSend())) { return }
    hasReadAloudRef.current = true
    setAutoReadPending(false)
    voiceInputRef.current?.stop()
    const imageFiles: VisionFile[] = files.filter(file => file.progress !== -1).map(fileItem => ({
      type: 'image',
      transfer_method: fileItem.type,
      url: fileItem.url,
      upload_file_id: fileItem.fileId,
    }))
    const docAndOtherFiles: VisionFile[] = getProcessedFiles(attachmentFiles)
    const combinedFiles: VisionFile[] = [...imageFiles, ...docAndOtherFiles]
    onSend(queryRef.current, combinedFiles)
    if (!files.find(item => item.type === TransferMethod.local_file && !item.fileId)) {
      if (files.length) { onClear() }
      if (!isResponding) {
        setQuery('')
        queryRef.current = ''
      }
    }
    if (!attachmentFiles.find(item => item.transferMethod === TransferMethod.local_file && !item.uploadedId)) { setAttachmentFiles([]) }
  }

  const handleKeyUp = (e: any) => {
    if (e.code === 'Enter') {
      e.preventDefault()
      // prevent send message when using input method enter
      if (!e.shiftKey && !isUseInputMethod.current) { handleSend() }
    }
  }

  const handleKeyDown = (e: any) => {
    isUseInputMethod.current = e.nativeEvent.isComposing
    if (e.code === 'Enter' && !e.shiftKey) {
      const result = query.replace(/\n$/, '')
      setQuery(result)
      queryRef.current = result
      e.preventDefault()
    }
  }

  const suggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    queryRef.current = suggestion
    handleSend()
  }

  return (
    <div className={cn(!feedbackDisabled && 'px-3.5', 'h-full')}>
      {/* Chat List */}
      <div className="h-full space-y-[30px]">
        {chatList.map((item) => {
          if (item.isAnswer) {
            const isLast = item.id === chatList[chatList.length - 1].id
            return <Answer
              key={item.id}
              item={item}
              feedbackDisabled={feedbackDisabled}
              onFeedback={onFeedback}
              onRegenerate={onRegenerate}
              isResponding={isResponding && isLast}
              suggestionClick={suggestionClick}
            />
          }
          return (
            <Question
              key={item.id}
              id={item.id}
              content={item.content}
              useCurrentUserAvatar={useCurrentUserAvatar}
              imgSrcs={(item.message_files && item.message_files?.length > 0) ? item.message_files.map(item => item.url) : []}
            />
          )
        })}
      </div>
      {
        !isHideSendInput && (
          <div className='absolute z-10 bottom-0 left-0 right-0 pc:w-[794px] max-w-full mx-auto px-3.5'>
            <div className='bg-white dark:bg-gray-800 border-[1.5px] border-gray-200 dark:border-gray-700 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.25)] dark:shadow-[0_0_15px_rgba(59,130,246,0.15)]'>
              <div className='px-2 py-[7px] min-h-[44px]'>
                {
                  visionConfig?.enabled && (
                    <>
                      <div className='absolute bottom-[46px] left-[14px] flex items-center'>
                        <ChatImageUploader
                          settings={visionConfig}
                          onUpload={onUpload}
                          disabled={files.length >= visionConfig.number_limits}
                        />
                        <div className='mx-1 w-[1px] h-4 bg-black/5 dark:bg-white/10' />
                      </div>
                    </>
                  )
                }
                {
                  fileConfig?.enabled && (
                    <div className={`${visionConfig?.enabled ? 'pl-[52px]' : ''}`}>
                      <FileUploaderInAttachmentWrapper
                        fileConfig={fileConfig}
                        value={attachmentFiles}
                        onChange={setAttachmentFiles}
                      />
                    </div>
                  )
                }
                <Textarea
                  className={`
                    block w-full px-2 leading-5 max-h-none text-base text-gray-700 dark:text-gray-300 outline-none appearance-none resize-none bg-transparent
                    ${visionConfig?.enabled && 'pl-12'}
                  `}
                  value={query}
                  onChange={handleContentChange}
                  onKeyUp={handleKeyUp}
                  onKeyDown={handleKeyDown}
                  autoSize
                />
              </div>
              <div className="flex items-center justify-between px-2 py-1">
                <div className="flex items-center gap-1">
                  <VoiceInput
                    ref={voiceInputRef}
                    onResult={(text) => {
                      setQuery(text)
                      queryRef.current = text
                    }}
                    onAutoSend={handleSend}
                    disabled={isResponding}
                    autoStopOnTimeout={autoStopOnTimeout}
                    timeoutMs={timeoutMs}
                    autoSendOnTimeout={autoSendOnTimeout}
                    autoReadAloud={autoReadAloud}
                  />
                  <VoiceSettings
                    autoStopOnTimeout={autoStopOnTimeout}
                    onAutoStopChange={setAutoStopOnTimeout}
                    autoSendOnTimeout={autoSendOnTimeout}
                    onAutoSendChange={setAutoSendOnTimeout}
                    autoReadAloud={autoReadAloud}
                    onAutoReadAloudChange={setAutoReadAloud}
                    timeoutMs={timeoutMs}
                    onTimeoutChange={setTimeoutMs}
                  />
                  {query.trim().length > 0 && <div className={`${s.count} text-sm bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 rounded`}>{query.trim().length}</div>}
                </div>
                {isResponding && onStopResponding
                  ? (
                    <div
                      className="flex items-center justify-center w-8 h-8 cursor-pointer rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      onClick={onStopResponding}
                      title="停止响应"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM3.75 12a8.25 8.25 0 1116.5 0 8.25 8.25 0 01-16.5 0z" clipRule="evenodd" />
                        <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
                      </svg>
                    </div>
                  )
                  : (
                    <Tooltip
                      selector='send-tip'
                      htmlContent={
                        <div>
                          <div>{t('common.operation.send')} Enter</div>
                          <div>{t('common.operation.lineBreak')} Shift Enter</div>
                        </div>
                      }
                    >
                      <div className={`${s.sendBtn} w-8 h-8 cursor-pointer rounded-md`} onClick={handleSend}></div>
                    </Tooltip>
                  )}
              </div>
            </div>
          </div>
        )
      }
    </div>
  )
}

export default React.memo(Chat)
