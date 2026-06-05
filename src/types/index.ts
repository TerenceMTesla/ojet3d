export type GenerationTier = 'draft' | 'production'

export type GenerationStatus =
  | 'idle'
  | 'generating_2d'
  | 'converting_3d'
  | 'ready'
  | 'error'

export type AssetFileType = 'glb' | 'gltf' | 'obj' | 'stl' | 'image'

export interface Asset {
  id: string
  jobId?: string  // Worker-side job id (for variant swaps + asset URL)
  prompt: string
  imageUrl?: string
  glbUrl?: string
  fileType?: AssetFileType
  status: GenerationStatus
  tier: GenerationTier
  createdAt: number
  transforms: TransformState
  // Variant cycling (Sketchfab-sourced assets)
  variantIndex?: number
  variantCount?: number
  variantName?: string
  variantAuthor?: string
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
