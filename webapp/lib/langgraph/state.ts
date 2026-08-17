import { Annotation, START, END } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  executionMode: Annotation<'chat' | 'react' | 'plan_and_execute'>({
    reducer: (_, update) => update,
    default: () => 'chat' as const,
  }),
  activeAgent: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  current_step_id: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
})

export type AgentStateType = typeof AgentState.State

export { START, END }
