const url = 'https://cn.bing.com/search?q=%E8%BE%B0%E5%AE%89%E7%A7%91%E6%8A%80+%E4%B8%BB%E8%A6%81%E4%B8%9A%E5%8A%A1&count=5'

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
}).then(r => r.text()).then((html) => {
  // 提取文本内容
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/\s+/g, ' ').trim()

  console.log('Extracted text length:', text.length)
  console.log('Contains 辰安科技:', text.includes('辰安科技'))

  // 查找辰安科技附近的内容
  const idx = text.indexOf('辰安科技')
  if (idx > 0) {
    console.log('Context around 辰安科技:', text.substring(Math.max(0, idx - 100), idx + 500))
  } else {
    console.log('辰安科技 not found in text')
    console.log('First 1000 chars:', text.substring(0, 1000))
  }
}).catch(e => console.log('Error:', e.message))
