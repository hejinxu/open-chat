import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { isRequestAuthenticated } from '@/app/api/utils/common'
import type { ConversationRecord, MessageRecord } from '@/lib/storage/types'

interface MergeRequest {
  strategy: 'remote' | 'local' | 'merge'
  localData?: {
    conversations: ConversationRecord[]
    messages: MessageRecord[]
  }
  remoteData?: {
    conversations: ConversationRecord[]
    messages: MessageRecord[]
  }
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: MergeRequest = await request.json()
    const { strategy } = body

    const db = getDatabaseProvider()

    switch (strategy) {
      case 'remote': {
        // 以远程数据为准，直接返回（调用方需要将远程数据同步到本地）
        const conversations = await db.getConversations()
        const allMessages: MessageRecord[] = []
        for (const conv of conversations) {
          const messages = await db.getMessages(conv.id)
          allMessages.push(...messages)
        }
        return NextResponse.json({
          success: true,
          data: { conversations, messages: allMessages },
        })
      }

      case 'local': {
        // 以本地数据为准，写入远程
        if (!body.localData) {
          return NextResponse.json(
            { success: false, error: 'Missing localData for local strategy' },
            { status: 400 },
          )
        }

        for (const conv of body.localData.conversations) {
          await db.saveConversation(conv)
        }
        for (const msg of body.localData.messages) {
          await db.saveMessage(msg)
        }

        return NextResponse.json({ success: true })
      }

      case 'merge': {
        // 合并策略：以 updated_at 最新的为准
        if (!body.localData || !body.remoteData) {
          return NextResponse.json(
            { success: false, error: 'Missing localData or remoteData for merge strategy' },
            { status: 400 },
          )
        }

        const mergedConversations = new Map<string, ConversationRecord>()
        const mergedMessages = new Map<string, MessageRecord>()

        // 先添加远程数据
        for (const conv of body.remoteData.conversations) {
          mergedConversations.set(conv.id, conv)
        }
        for (const msg of body.remoteData.messages) {
          mergedMessages.set(msg.id, msg)
        }

        // 合并本地数据（以 updated_at 最新的为准）
        for (const conv of body.localData.conversations) {
          const existing = mergedConversations.get(conv.id)
          if (!existing || conv.updated_at > existing.updated_at) {
            mergedConversations.set(conv.id, conv)
          }
        }
        for (const msg of body.localData.messages) {
          if (!mergedMessages.has(msg.id)) {
            mergedMessages.set(msg.id, msg)
          }
        }

        // 写入合并后的数据
        const conversations = Array.from(mergedConversations.values())
        const messages = Array.from(mergedMessages.values())

        for (const conv of conversations) {
          await db.saveConversation(conv)
        }
        for (const msg of messages) {
          await db.saveMessage(msg)
        }

        return NextResponse.json({
          success: true,
          data: { conversations, messages },
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown strategy: ${strategy}` },
          { status: 400 },
        )
    }
  } catch (error: any) {
    console.error('POST /api/storage/merge error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    )
  }
}
