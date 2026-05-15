import type { AppInfo } from '@/types/app'
export type { ThemeMode } from './theme'
export {
  THEME_MODES,
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  isValidThemeMode,
} from './theme'

export const APP_ID = `${process.env.NEXT_PUBLIC_APP_ID}`
export const API_KEY = `${process.env.NEXT_PUBLIC_APP_KEY}`
export const API_URL = `${process.env.NEXT_PUBLIC_API_URL}`
export const APP_INFO: AppInfo = {
  title: 'Chat APP',
  description: '',
  copyright: '',
  privacy_policy: '',
  default_language: 'zh-Hans',
  disable_session_same_site: false, // set it to true if you want to embed the chatbot in an iframe
}

export const isShowPrompt = false
export const promptTemplate = 'I want you to act as a javascript console.'

export const BASE_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}`

export const LOCALE_COOKIE_NAME = 'locale'

export const DEFAULT_VALUE_MAX_LEN = 48
