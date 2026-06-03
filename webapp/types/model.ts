export type ProviderType = 'openai' | 'anthropic' | 'siliconflow' | 'ollama' | 'custom'

export interface ModelProvider {
  id: string
  name: string
  provider_type: ProviderType
  api_key: string
  api_base_url: string
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export interface Model {
  id: string
  provider_id: string
  model_name: string
  display_name: string
  description: string
  context_window: number | null
  max_output_tokens: number | null
  capabilities: string[]
  pricing_input: number | null
  pricing_output: number | null
  default_params: Record<string, any>
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export interface ModelWithProvider extends Model {
  provider_name: string
  provider_type: ProviderType
  provider_api_key: string
  provider_api_base_url: string
}
