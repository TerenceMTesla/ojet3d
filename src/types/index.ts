export type GenerationTier = 'draft' | 'production'

export type GenerationStatus =
  | 'idle'
  | 'generating_2d'
  | 'converting_3d'
  | 'ready'
  | 'error'

export interface Asset {
  id: string
  prompt: string
  imageUrl?: string
  glbUrl?: string
  status: GenerationStatus
  tier: GenerationTier
  createdAt: number
  transforms: TransformState
}

export interface TransformState {
  twist: number
  taper: number
  bend: number
  smooth: number
  scaleX: number
  scaleY: number
  scaleZ: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  mutations?: Partial<TransformState>
}

export interface GenerationSource {
  id: string
  name: string
  tier: GenerationTier
  type: '2d' | '3d'
  available: boolean
}
