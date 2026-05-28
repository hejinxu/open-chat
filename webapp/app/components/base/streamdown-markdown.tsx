'use client'
import { Streamdown } from 'streamdown'
import 'katex/dist/katex.min.css'
import { stripCommands } from '@/lib/command-parser'

interface StreamdownMarkdownProps {
  content: string
  className?: string
}

export function StreamdownMarkdown({ content, className = '' }: StreamdownMarkdownProps) {
  const cleanContent = stripCommands(content)
  return (
    <div className={`streamdown-markdown ${className} break-words overflow-hidden`}>
      <Streamdown>{cleanContent}</Streamdown>
    </div>
  )
}

export default StreamdownMarkdown
