export type JobStatus =
  | 'queued'
  | 'generating_image'
  | 'converting_3d'
  | 'ready'
  | 'failed'

export type JobTier = 'draft' | 'production'

export interface Job {
  id: string
  prompt: string
  tier: JobTier
  status: JobStatus
  provider2d: string
  provider3d: string
  imageUrl?: string
  glbUrl?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface GenerateRequest {
  prompt: string
  tier?: JobTier
}

export interface Env {
  JOBS: DurableObjectNamespace
  PRODIA_API_KEY: string
  TRIPO_API_KEY: string
  MESHY_API_KEY: string
  // The full public URL of this worker, used to build webhook callback URLs
  WORKER_URL: string
}
