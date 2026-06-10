const regex = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi

fetch('https://cn.bing.com/search?q=辰安科技+主要业务&count=5', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
}).then(r => r.text()).then((html) => {
  let match
  let count = 0
  while ((match = regex.exec(html)) !== null && count < 3) {
    console.log('URL:', match[1])
    console.log('Title:', match[2].replace(/<[^>]+>/g, '').trim())
    console.log('Snippet:', match[3].replace(/<[^>]+>/g, '').trim().substring(0, 200))
    console.log('---')
    count++
  }
  if (count === 0) {
    console.log('No results found')
    console.log('HTML length:', html.length)
    console.log('Has b_algo:', html.includes('b_algo'))
  }
}).catch(e => console.log('Error:', e.message))
