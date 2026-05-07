'use client'
import type { FC } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import React, { useRef } from 'react'
import Base from '../editor/base'
import { CodeLanguage } from '@/types/app'
import './style.css'
import { useThemeContext } from '@/app/components/theme-provider'

// load file from local instead of cdn https://github.com/suren-atoyan/monaco-react/issues/482
loader.config({ paths: { vs: '/vs' } })

interface Props {
  value?: string | object
  onChange?: (value: string) => void
  title: JSX.Element
  language: CodeLanguage
  headerRight?: JSX.Element
  readOnly?: boolean
  isJSONStringifyBeauty?: boolean
  height?: number
}

const languageMap = {
  [CodeLanguage.javascript]: 'javascript',
  [CodeLanguage.python3]: 'python',
  [CodeLanguage.json]: 'json',
}

const CodeEditor: FC<Props> = ({
  value = '',
  onChange = () => { },
  title,
  headerRight,
  language,
  readOnly,
  isJSONStringifyBeauty,
  height,
}) => {
  const [isFocus, setIsFocus] = React.useState(false)
  const { resolvedTheme } = useThemeContext()

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '')
  }

  const editorRef = useRef(null)
  const monacoRef = useRef<any>(null)

  const defineThemes = (monaco: any) => {
    monaco.editor.defineTheme('light-blur-theme', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#F2F4F7',
      },
    })

    monaco.editor.defineTheme('light-focus-theme', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
      },
    })

    monaco.editor.defineTheme('dark-blur-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1F2937',
      },
    })

    monaco.editor.defineTheme('dark-focus-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#111827',
      },
    })

    monaco.editor.defineTheme('tech-blue-blur-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': 'rgba(30, 53, 84, 0.85)',
      },
    })

    monaco.editor.defineTheme('tech-blue-focus-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': 'rgba(22, 45, 74, 0.9)',
      },
    })
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editor.onDidFocusEditorText(() => {
      setIsFocus(true)
    })
    editor.onDidBlurEditorText(() => {
      setIsFocus(false)
    })

    defineThemes(monaco)

    // 禁用开发工具相关的快捷键和命令面板
    editor.addAction({
      id: 'editor.action.showCommands',
      label: 'Show Commands',
      keybindings: [],
      run: () => { },
    })

    // 禁用 F1, F2 等可能打开设置的快捷键
    editor.addCommand(monaco.KeyCode.F1, () => { })
    editor.addCommand(monaco.KeyCode.F2, () => { })
    editor.addCommand(monaco.KeyCode.F9, () => { })
    editor.addCommand(monaco.KeyCode.F10, () => { })
    editor.addCommand(monaco.KeyCode.F11, () => { })
    editor.addCommand(monaco.KeyCode.F12, () => { })

    // 禁用右键菜单
    editor.addCommand(monaco.KeyCode.ContextMenu, () => { })
  }

  const outPutValue = (() => {
    if (!isJSONStringifyBeauty) { return value as string }
    try {
      return JSON.stringify(value as object, null, 2)
    }
    catch (e) {
      return value as string
    }
  })()

  const currentTheme = React.useMemo(() => {
    const prefix = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'tech-blue' ? 'tech-blue' : 'light'
    return isFocus ? `${prefix}-focus-theme` : `${prefix}-blur-theme`
  }, [isFocus, resolvedTheme])

  return (
    <div>
      <Base
        title={title}
        value={outPutValue}
        headerRight={headerRight}
        isFocus={isFocus && !readOnly}
        minHeight={height || 200}
      >
        <>
          {/* https://www.npmjs.com/package/@monaco-editor/react */}
          <Editor
            className='h-full'
            // language={language === CodeLanguage.javascript ? 'javascript' : 'python'}
            language={languageMap[language] || 'javascript'}
            theme={currentTheme}
            value={outPutValue}
            onChange={handleEditorChange}
            // https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IEditorOptions.html
            options={{
              readOnly,
              domReadOnly: true,
              quickSuggestions: false,
              minimap: { enabled: false },
              lineNumbersMinChars: 1, // would change line num width
              wordWrap: 'on', // auto line wrap
              automaticLayout: true,
              suggest: { showKeywords: false, showSnippets: false },
              hover: { enabled: false },
              parameterHints: { enabled: false },
              colorDecorators: { enabled: false },
              renderLineHighlight: 'none',
              contextmenu: false,
              // lineNumbers: (num) => {
              //   return <div>{num}</div>
              // }
            }}
            onMount={handleEditorDidMount}
          />
        </>
      </Base>
    </div>
  )
}
export default React.memo(CodeEditor)
