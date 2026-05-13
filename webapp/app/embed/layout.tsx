import { getLocaleOnServer } from '@/i18n/server'
import { ThemeProvider } from '@/app/components/theme-provider'

import '@/app/styles/globals.css'
import '@/app/styles/markdown.scss'

interface EmbedLayoutProps {
  children: React.ReactNode
}

const EmbedLayout = async ({ children }: EmbedLayoutProps) => {
  const locale = await getLocaleOnServer()
  return (
    <html lang={locale ?? 'en'} className="h-full" suppressHydrationWarning>
      <body className="h-full" suppressHydrationWarning>
        <ThemeProvider>
          <div className="w-full h-full min-w-0 overflow-hidden">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

export default EmbedLayout
