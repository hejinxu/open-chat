import { Tiktoken } from 'js-tiktoken/lite'
import fs from 'fs'
import path from 'path'

let tiktokenLoaded = false

// 项目目录中的编码文件（优先加载）
const BUNDLED_FILE = path.join(process.cwd(), 'lib', 'langgraph', 'tiktoken', 'o200k_base.json')
// 缓存目录（备用）
const CACHE_DIR = path.join(process.cwd(), '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'tiktoken-o200k_base.json')

export async function preloadTiktoken(): Promise<void> {
  if (tiktokenLoaded) {
    return
  }

  try {
    let data: any

    // 1. 优先从项目目录加载（打包时包含）
    if (fs.existsSync(BUNDLED_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(BUNDLED_FILE, 'utf-8'))
        console.log('[tiktoken] Loaded from bundled file:', BUNDLED_FILE)
      } catch {
        console.warn('[tiktoken] Bundled file corrupted, trying cache...')
      }
    }

    // 2. 尝试从缓存目录加载
    if (!data && fs.existsSync(CACHE_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
        console.log('[tiktoken] Loaded from cache:', CACHE_FILE)
      } catch {
        // 缓存文件损坏，删除
        fs.unlinkSync(CACHE_FILE)
      }
    }

    // 3. 如果都没有，从网络下载
    if (!data) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('https://tiktoken.pages.dev/js/o200k_base.json', {
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.ok) {
        data = await response.json()

        // 保存到缓存目录
        try {
          if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true })
          }
          fs.writeFileSync(CACHE_FILE, JSON.stringify(data))
          console.log('[tiktoken] Downloaded and cached to', CACHE_FILE)
        } catch (writeError) {
          console.warn('[tiktoken] Failed to cache:', writeError)
        }
      }
    }

    if (data) {
      const encoding = new Tiktoken(data)

      // 将编码数据存储到全局变量，供 LangChain 使用
      const globalObj = globalThis as any
      if (!globalObj.__tiktoken_encoding_cache) {
        globalObj.__tiktoken_encoding_cache = {}
      }
      globalObj.__tiktoken_encoding_cache.o200k_base = encoding

      tiktokenLoaded = true
      console.log('[tiktoken] Preloaded o200k_base encoding')
    } else {
      console.warn('[tiktoken] Failed to load encoding, will use approximation')
    }
  } catch (error) {
    console.warn('[tiktoken] Failed to preload, will use approximation:', error instanceof Error ? error.message : error)
  }
}
