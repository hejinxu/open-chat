export const i18n = {
  defaultLocale: 'zh-Hans',
  locales: ['zh-Hans', 'en', 'es', 'ja', 'fr'],
} as const

export type Locale = typeof i18n['locales'][number]
