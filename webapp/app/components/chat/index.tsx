'use client'
import type { FC } from 'react'
import React, { useEffect, useRef } from 'react'
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
import { VOICE_INPUT_CONFIG, type VoiceRecognitionEngine } from '@/config/voice-input'
import { VoiceSettings } from './voice-settings'
import { AgentSelector } from './agent-selector'
import type { WhisperModel } from './voice-recognition/whisper-recognition'

export interface IChatProps {
  chatList: ChatItem[]
  feedbackDisabled?: boolean
  isHideSendInput?: boolean
  onFeedback?: FeedbackFunc
  onRegenerate?: (id: string) => void
  onDeleteMessage?: (id: string) => void
  checkCanSend?: () => boolean
  onSend?: (message: string, files: VisionFile[], agentId?: string | null) => void
  useCurrentUserAvatar?: boolean
  isResponding?: boolean
  onStopResponding?: () => void
  controlClearQuery?: number
  visionConfig?: VisionSettings
  fileConfig?: FileUpload
  selectedAgentId?: string | null
  onAgentChange?: (agentId: string | null) => void
  apiKey?: string
  isChatListLoading?: boolean
}

const Chat: FC<IChatProps> = ({
  chatList,
  feedbackDisabled = false,
  isHideSendInput = false,
  onFeedback,
  onRegenerate,
  onDeleteMessage,
  checkCanSend,
  onSend = () => { },
  useCurrentUserAvatar,
  isResponding,
  onStopResponding,
  controlClearQuery,
  visionConfig,
  fileConfig,
  selectedAgentId,
  onAgentChange,
  apiKey,
  isChatListLoading = false,
}) => {
  const { t } = useTranslation()
  const { notify } = Toast
  const isUseInputMethod = useRef(false)

  const [query, setQuery] = React.useState('')
  const queryRef = useRef('')
  const [autoStopOnNoInput, setAutoStopOnNoInput] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice-auto-stop-on-no-input')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })
  const [autoSendOnStop, setAutoSendOnStop] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice-auto-send-on-stop')
      return saved !== null ? saved === 'true' : VOICE_INPUT_CONFIG.AUTO_SEND_ON_STOP
    }
    return VOICE_INPUT_CONFIG.AUTO_SEND_ON_STOP
  })
  const [autoReadAloud, setAutoReadAloud] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice-auto-read')
      return saved !== null ? saved === 'true' : VOICE_INPUT_CONFIG.AUTO_READ_ALOUD
    }
    return VOICE_INPUT_CONFIG.AUTO_READ_ALOUD
  })
  const getDefaultNoInputMs = (engine: VoiceRecognitionEngine) => {
    return engine === 'whisper'
      ? VOICE_INPUT_CONFIG.NO_INPUT_TIMEOUT_MS_WHISPER
      : VOICE_INPUT_CONFIG.NO_INPUT_TIMEOUT_MS_BROWSER
  }
  const [noInputMs, setNoInputMs] = React.useState(() => {
    const engine = (typeof window !== 'undefined' && localStorage.getItem('voice-engine')) || VOICE_INPUT_CONFIG.DEFAULT_ENGINE
    const key = `voice-no-input-ms-${engine}`
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(key)
      return saved !== null ? Number(saved) : getDefaultNoInputMs(engine as VoiceRecognitionEngine)
    }
    return getDefaultNoInputMs(engine as VoiceRecognitionEngine)
  })
  const [voiceEngine, setVoiceEngine] = React.useState<VoiceRecognitionEngine>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice-engine')
      if (saved === 'browser' || saved === 'whisper') { return saved }
    }
    return VOICE_INPUT_CONFIG.DEFAULT_ENGINE
  })
  const [whisperModel, setWhisperModel] = React.useState<WhisperModel>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('whisper-model')
      const validModels: WhisperModel[] = ['whisper-tiny', 'whisper-base', 'whisper-small', 'funasr-paraformer-zh', 'funasr-sensevoice']
      if (validModels.includes(saved as WhisperModel)) { return saved as WhisperModel }
    }
    return 'whisper-tiny'
  })

  const handleAutoStopChange = (val: boolean) => {
    setAutoStopOnNoInput(val)
    localStorage.setItem('voice-auto-stop-on-no-input', String(val))
  }
  const handleAutoSendChange = (val: boolean) => {
    setAutoSendOnStop(val)
    localStorage.setItem('voice-auto-send-on-stop', String(val))
  }
  const handleAutoReadAloudChange = (val: boolean) => {
    setAutoReadAloud(val)
    localStorage.setItem('voice-auto-read', String(val))
  }
  const handleTimeoutChange = (val: number) => {
    setNoInputMs(val)
    const key = `voice-no-input-ms-${voiceEngine}`
    localStorage.setItem(key, String(val))
  }
  const handleVoiceEngineChange = (val: VoiceRecognitionEngine) => {
    setVoiceEngine(val)
    localStorage.setItem('voice-engine', val)
    const key = `voice-no-input-ms-${val}`
    const saved = localStorage.getItem(key)
    setNoInputMs(saved !== null ? Number(saved) : getDefaultNoInputMs(val))
  }
  const handleWhisperModelChange = (val: WhisperModel) => {
    setWhisperModel(val)
    localStorage.setItem('whisper-model', val)
  }
  const voiceInputRef = React.useRef<{ stop: () => void }>(null)
  const chatListContainerRef = useRef<HTMLDivElement>(null)
  const contentWrapperRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const wrapper = contentWrapperRef.current
    const container = chatListContainerRef.current
    if (!wrapper || !container) return
    const ro = new ResizeObserver(() => {
      container.scrollTop = container.scrollHeight
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

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
    onSend(queryRef.current, combinedFiles, selectedAgentId)
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
    <div className='flex flex-col grow overflow-hidden'>
      {/* Chat List - scrollbar at screen edge */}
      <div ref={chatListContainerRef} className="flex flex-col grow overflow-y-auto">
        <div ref={contentWrapperRef} className="pc:w-[794px] max-w-full mobile:w-full mx-auto space-y-[30px] pb-4 px-3.5">
          {isChatListLoading && chatList.length === 0 && (
            <div className='flex justify-center items-center h-32'>
              <div className='flex items-center space-x-2 text-content-tertiary text-sm'>
                <svg className='animate-spin h-5 w-5' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                  <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                  <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
                </svg>
                <span>加载消息中...</span>
              </div>
            </div>
          )}
          {chatList.map((item) => {
            if (item.isAnswer) {
              const isLast = item.id === chatList[chatList.length - 1].id
              return <Answer
                key={item.id}
                item={item}
                feedbackDisabled={feedbackDisabled}
                onFeedback={onFeedback}
                onRegenerate={onRegenerate}
                onDeleteMessage={onDeleteMessage}
                isLastMessage={isLast}
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
        <div className="h-0 overflow-hidden" />
      </div>
      {
        !isHideSendInput && (
          <div className='shrink-0 px-3.5 bg-surface pb-3 pt-2'>
            <div className='pc:w-[794px] max-w-full mx-auto border-[1.5px] border-border rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.25)]'>
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
                        <div className='mx-1 w-[1px] h-4 bg-border-subtle' />
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
                    block w-full px-2 leading-5 max-h-none text-base text-content-tertiary outline-none appearance-none resize-none bg-transparent
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
                  <AgentSelector
                    value={selectedAgentId ?? null}
                    onChange={onAgentChange || (() => {})}
                    apiKey={apiKey}
                  />
                  <VoiceInput
                    ref={voiceInputRef}
                    onResult={(text) => {
                      setQuery(text)
                      queryRef.current = text
                    }}
                    onAutoSend={handleSend}
                    disabled={isResponding}
                    autoStopOnNoInput={autoStopOnNoInput}
                    noInputMs={noInputMs}
                    autoSendOnStop={autoSendOnStop}
                    autoReadAloud={autoReadAloud}
                    engine={voiceEngine}
                    whisperModel={whisperModel}
                  />
                  <VoiceSettings
                    autoStopOnNoInput={autoStopOnNoInput}
                    onAutoStopChange={handleAutoStopChange}
                    autoSendOnStop={autoSendOnStop}
                    onAutoSendChange={handleAutoSendChange}
                    autoReadAloud={autoReadAloud}
                    onAutoReadAloudChange={handleAutoReadAloudChange}
                    noInputMs={noInputMs}
                    onTimeoutChange={handleTimeoutChange}
                    engine={voiceEngine}
                    onEngineChange={handleVoiceEngineChange}
                    whisperModel={whisperModel}
                    onWhisperModelChange={handleWhisperModelChange}
                  />
                  {query.trim().length > 0 && <div className={`${s.count} text-sm bg-surface-tertiary text-content-tertiary px-2 rounded`}>{query.trim().length}</div>}
                </div>
                {isResponding && onStopResponding
                  ? (
                    <div
                      className="flex items-center justify-center w-8 h-8 cursor-pointer rounded-md text-red-500 hover:bg-red-50 transition-colors"
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
