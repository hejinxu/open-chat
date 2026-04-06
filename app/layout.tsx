import { getLocaleOnServer } from '@/i18n/server'
import { ThemeProvider } from './components/theme-provider'
import { DisableDevTools } from './components/disable-devtools'

import './styles/globals.css'
import './styles/markdown.scss'

const LocaleLayout = async ({
  children,
}: {
  children: React.ReactNode
}) => {
  const locale = await getLocaleOnServer()
  return (
    <html lang={locale ?? 'en'} className="h-full" suppressHydrationWarning>
      <body className="h-full" suppressHydrationWarning>
        <DisableDevTools />
        <ThemeProvider>
          <div className="overflow-x-auto" suppressHydrationWarning>
            <div className="w-screen h-screen min-w-[300px]">
              {children}
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

export default LocaleLayout
