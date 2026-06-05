import { NextResponse } from 'next/server'
import svgCaptcha from 'svg-captcha'
import { generateCaptchaId, saveCaptcha } from '@/lib/auth/captcha-store'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const theme = searchParams.get('theme')

  const captcha = svgCaptcha.create({
    size: 4,
    noise: 3,
    color: true,
    inverse: theme === 'dark',
    background: theme === 'dark' ? '#1a1a1a' : '#f0f0f0',
    width: 150,
    height: 50,
    fontSize: 45,
    ignoreChars: '0oO1lIi',
  })

  // Store captcha on server side
  const captchaId = generateCaptchaId()
  saveCaptcha(captchaId, captcha.text)

  const response = NextResponse.json({
    captchaId,
    svg: captcha.data,
  }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })

  return response
}
