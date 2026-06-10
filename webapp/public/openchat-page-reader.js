/**
 * OpenChat Page Reader - 宿主页面 JS 工具库
 *
 * 用于在嵌入式对话模式下，让 AI 能够读取和理解宿主页面的内容。
 *
 * 使用方式：
 * <script src="https://your-openchat-domain.com/openchat-page-reader.js"></script>
 *
 * 或者通过 npm 安装：
 * npm install @openchat/page-reader
 */

(function(global) {
  'use strict'

  const VERSION = '1.0.0'
  const NAMESPACE = 'com.openchat.page-reader'

  class OpenChatPageReader {
    constructor() {
      this.version = VERSION
      this._initialized = false
      this._eventHandlers = new Map()
      this.init()
    }

    init() {
      if (this._initialized) return

      window.addEventListener('message', this._handleMessage.bind(this))
      this._initialized = true

      this._notifyReady()
    }

    _handleMessage(event) {
      const data = event.data
      if (!data || data.type !== NAMESPACE) return

      const { action, requestId, params } = data

      let result
      switch (action) {
        case 'get_page_content':
          result = this.getPageContent()
          break
        case 'get_selected_text':
          result = this.getSelectedText()
          break
        case 'get_element_by_selector':
          result = this.getElementBySelector(params?.selector, params?.extractType)
          break
        case 'ping':
          result = { pong: true, version: this.version }
          break
        default:
          result = { error: `Unknown action: ${action}` }
      }

      if (requestId && event.source) {
        event.source.postMessage({
          type: NAMESPACE,
          requestId,
          result,
        }, '*')
      }
    }

    _notifyReady() {
      window.parent.postMessage({
        type: NAMESPACE,
        action: 'ready',
        version: this.version,
      }, '*')
    }

    /**
     * 获取当前页面的完整内容
     * @returns {Object} 页面内容对象
     */
    getPageContent() {
      try {
        const title = document.title || ''
        const url = window.location.href
        const content = this._extractTextContent(document.body)
        const metadata = this._getMetadata()

        return {
          success: true,
          data: {
            title,
            url,
            content,
            metadata,
            timestamp: new Date().toISOString(),
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    }

    /**
     * 获取用户选中的文本
     * @returns {Object} 选中的文本内容
     */
    getSelectedText() {
      try {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
          return {
            success: true,
            data: {
              text: '',
              range: null,
            }
          }
        }

        const text = selection.toString()
        const range = selection.getRangeAt(0)

        return {
          success: true,
          data: {
            text,
            range: {
              start: range.startOffset,
              end: range.endOffset,
              startContainer: this._getPath(range.startContainer),
              endContainer: this._getPath(range.endContainer),
            }
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    }

    /**
     * 根据 CSS 选择器获取元素内容
     * @param {string} selector - CSS 选择器
     * @param {string} extractType - 提取类型：'text', 'html', 'value'
     * @returns {Object} 元素内容
     */
    getElementBySelector(selector, extractType = 'text') {
      try {
        if (!selector) {
          return {
            success: false,
            error: 'Selector is required'
          }
        }

        const elements = document.querySelectorAll(selector)
        if (elements.length === 0) {
          return {
            success: true,
            data: {
              found: false,
              content: '',
              count: 0,
            }
          }
        }

        let content
        switch (extractType) {
          case 'html':
            content = Array.from(elements).map(el => el.innerHTML).join('\n')
            break
          case 'value':
            content = Array.from(elements).map(el => el.value || '').join('\n')
            break
          case 'text':
          default:
            content = Array.from(elements).map(el => el.textContent?.trim() || '').join('\n')
            break
        }

        return {
          success: true,
          data: {
            found: true,
            content,
            count: elements.length,
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    }

    /**
     * 提取元素的文本内容（去除脚本和样式）
     * @param {Element} element - DOM 元素
     * @returns {string} 文本内容
     */
    _extractTextContent(element) {
      if (!element) return ''

      const clone = element.cloneNode(true)

      const scripts = clone.querySelectorAll('script, style, noscript')
      scripts.forEach(el => el.remove())

      const walker = document.createTreeWalker(
        clone,
        NodeFilter.SHOW_TEXT,
        null,
        false
      )

      const texts = []
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim()
        if (text) {
          texts.push(text)
        }
      }

      return texts.join(' ').replace(/\s+/g, ' ').trim()
    }

    /**
     * 获取页面元数据
     * @returns {Object} 元数据对象
     */
    _getMetadata() {
      const metadata = {}

      const description = document.querySelector('meta[name="description"]')
      if (description) {
        metadata.description = description.getAttribute('content') || ''
      }

      const keywords = document.querySelector('meta[name="keywords"]')
      if (keywords) {
        metadata.keywords = keywords.getAttribute('content') || ''
      }

      const author = document.querySelector('meta[name="author"]')
      if (author) {
        metadata.author = author.getAttribute('content') || ''
      }

      const ogTitle = document.querySelector('meta[property="og:title"]')
      if (ogTitle) {
        metadata.ogTitle = ogTitle.getAttribute('content') || ''
      }

      const ogDescription = document.querySelector('meta[property="og:description"]')
      if (ogDescription) {
        metadata.ogDescription = ogDescription.getAttribute('content') || ''
      }

      return metadata
    }

    /**
     * 获取元素的 CSS 路径
     * @param {Node} node - DOM 节点
     * @returns {string} CSS 选择器路径
     */
    _getPath(node) {
      if (!node || !node.parentNode) return ''

      const parts = []
      let current = node

      while (current && current !== document.body) {
        if (current.id) {
          parts.unshift(`#${current.id}`)
          break
        }

        let selector = current.tagName?.toLowerCase() || ''
        const className = current.className
        if (className && typeof className === 'string') {
          const classes = className.trim().split(/\s+/).slice(0, 2)
          if (classes.length > 0) {
            selector += '.' + classes.join('.')
          }
        }

        parts.unshift(selector)
        current = current.parentNode
      }

      return parts.join(' > ')
    }

    /**
     * 注册事件处理器
     * @param {string} event - 事件名称
     * @param {Function} handler - 处理函数
     */
    on(event, handler) {
      if (!this._eventHandlers.has(event)) {
        this._eventHandlers.set(event, [])
      }
      this._eventHandlers.get(event).push(handler)
    }

    /**
     * 移除事件处理器
     * @param {string} event - 事件名称
     * @param {Function} handler - 处理函数
     */
    off(event, handler) {
      const handlers = this._eventHandlers.get(event)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }

    /**
     * 销毁实例
     */
    destroy() {
      window.removeEventListener('message', this._handleMessage)
      this._eventHandlers.clear()
      this._initialized = false
    }
  }

  const reader = new OpenChatPageReader()

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = reader
  } else {
    global.OpenChatPageReader = reader
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this)
