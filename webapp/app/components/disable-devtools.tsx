'use client'

import { useEffect } from 'react'

export function DisableDevTools() {
  useEffect(() => {
    // 尝试禁用 React DevTools 钩子
    if (typeof window !== 'undefined') {
      // 删除 React DevTools 全局钩子
      if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        try {
          delete (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
        }
        catch (e) {
          (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = null
        }
      }

      // 尝试禁用 React DevTools 的注入
      const originalDefineProperty = Object.defineProperty
      Object.defineProperty = function (obj, prop, descriptor) {
        if (prop === '__REACT_DEVTOOLS_GLOBAL_HOOK__') {
          return obj
        }
        return originalDefineProperty(obj, prop, descriptor)
      }
    }
  }, [])

  return null
}
