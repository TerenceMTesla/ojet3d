/**
 * Generation pipeline — frontend entry point.
 *
 * When VITE_WORKER_URL is set: delegates entirely to the Cloudflare Worker.
 *
 * Fallback (no worker URL, local dev):
 *   has Tripo key → Tripo AI text-to-model (~30s, paid per generation)
 *   no keys       → sample GLB (demo mode)
 */

import type { GenerationTier } from '../../types'

const SAMPLE_GLB =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb'

function workerUrl(): string {
  return (import.meta.env.VITE_WORKER_URL ?? '').trim()
}

// ── Worker-backed path (production) ──────────────────────────────────────

export interface PipelineResult {
  imageUrl: string
  glbUrl: string
  jobId?: string
  variantIndex?: number
  variantCount?: number
  variantName?: string
  variantAuthor?: string
}

export async function runPipelineViaWorker(
  prompt: string,
  tier: GenerationTier,
  onUpdate: (status: string, label: string) => void,
): Promise<PipelineResult> {
  const base = workerUrl()

  const res = await fetch(`${base}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, tier }),
  })
  if (!res.ok) throw new Error(`Worker /generate failed: ${res.status}`)
  const { jobId } = await res.json() as { jobId: string }

  const completion = await listenForCompletion(`${base}/status/${jobId}`, onUpdate)
  return { ...completion, jobId }
}

export async function swapVariant(jobId: string): Promise<{
  glbUrl: string
  variantIndex: number
  variantName?: string
} | null> {
  const base = workerUrl()
  if (!base) return null
  const res = await fetch(`${base}/variant/${jobId}`, { method: 'POST' })
  if (!res.ok) return null
  const data = await res.json() as { ok: boolean; variantIndex?: number; name?: string }
  if (!data.ok || typeof data.variantIndex !== 'number') return null
  return {
    glbUrl: `${base}/asset/${jobId}.glb?v=${data.variantIndex}`,
    variantIndex: data.variantIndex,
    variantName: data.name,
  }
}

function listenForCompletion(
  sseUrl: string,
  onUpdate: (status: string, label: string) => void,
): Promise<PipelineResult> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(sseUrl)

    const timeout = setTimeout(() => {
      es.close()
      reject(new Error('Job timed out after 3 minutes'))
    }, 180_000)

    es.onmessage = (e) => {
      try {
        const job = JSON.parse(e.data) as {
          status: string
          provider3d: string
          imageUrl?: string
          glbUrl?: string
          error?: string
          variantIndex?: number
          variantCount?: number
          variantName?: string
          variantAuthor?: string
        }

        const label =
          job.status === 'converting_3d'
            ? `${job.provider3d} generating 3D model…`
            : job.status

        onUpdate(job.status, label)

        if (job.status === 'ready' && job.glbUrl) {
          clearTimeout(timeout)
          es.close()
          resolve({
            imageUrl: job.imageUrl ?? '',
            glbUrl: job.glbUrl,
            variantIndex: job.variantIndex,
            variantCount: job.variantCount,
            variantName: job.variantName,
            variantAuthor: job.variantAuthor,
          })
        }
        if (job.status === 'failed') {
          clearTimeout(timeout)
          es.close()
          reject(new Error(job.error ?? 'Pipeline failed'))
        }
      } catch {
        // malformed SSE frame — ignore
      }
    }

    es.onerror = () => {
      clearTimeout(timeout)
      es.close()
      reject(new Error('SSE connection lost'))
    }
  })
}

// ── Direct browser path (dev / no worker) ────────────────────────────────

export async function runPipeline(prompt: string): Promise<PipelineResult> {
  if (workerUrl()) {
    return runPipelineViaWorker(prompt, 'draft', () => {})
  }

  if (import.meta.env.VITE_TRIPO_API_KEY) {
    const glbUrl = await import('./tripo').then(m => m.textToModelWithTripo(prompt))
    return { imageUrl: '', glbUrl }
  }

  return { imageUrl: '', glbUrl: SAMPLE_GLB }
}
