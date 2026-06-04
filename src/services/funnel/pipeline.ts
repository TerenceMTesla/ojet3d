/**
 * Generation pipeline — frontend entry point.
 *
 * When VITE_WORKER_URL is set: delegates entirely to the Cloudflare Worker.
 *   POST /generate        → returns { jobId }
 *   GET  /status/:jobId   → SSE stream with Job state until status=ready|failed
 *
 * Fallback (no worker URL, local dev): calls Prodia + Tripo directly from the
 * browser using VITE_* keys. Functional but not tab-crash-safe.
 */

import type { GenerationTier } from '../../types'
import { generateWithProdia } from './prodia'
import { convertWithTripo } from './tripo'

const ORTHO_SUFFIX =
  ', isolated on solid neutral background, orthographic projection, uniform studio lighting, no shadows, clean 3D-ready asset'

const SAMPLE_GLB =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb'

function workerUrl(): string {
  return (import.meta.env.VITE_WORKER_URL ?? '').trim()
}

// ── Worker-backed path (production) ──────────────────────────────────────

export async function runPipelineViaWorker(
  prompt: string,
  tier: GenerationTier,
  onUpdate: (status: string, label: string) => void,
): Promise<{ imageUrl: string; glbUrl: string }> {
  const base = workerUrl()

  const res = await fetch(`${base}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, tier }),
  })
  if (!res.ok) throw new Error(`Worker /generate failed: ${res.status}`)
  const { jobId } = await res.json() as { jobId: string }

  return listenForCompletion(`${base}/status/${jobId}`, onUpdate)
}

function listenForCompletion(
  sseUrl: string,
  onUpdate: (status: string, label: string) => void,
): Promise<{ imageUrl: string; glbUrl: string }> {
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
          provider2d: string
          provider3d: string
          imageUrl?: string
          glbUrl?: string
          error?: string
        }

        const label =
          job.status === 'generating_image'
            ? `${job.provider2d} generating image…`
            : job.status === 'converting_3d'
            ? `${job.provider3d} converting to 3D…`
            : job.status

        onUpdate(job.status, label)

        if (job.status === 'ready' && job.glbUrl) {
          clearTimeout(timeout)
          es.close()
          resolve({ imageUrl: job.imageUrl ?? '', glbUrl: job.glbUrl })
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

export async function runPipeline(
  prompt: string,
  tier: GenerationTier,
): Promise<{ imageUrl: string; glbUrl: string }> {
  if (workerUrl()) {
    // Shouldn't be called when worker is configured — use runPipelineViaWorker instead
    return runPipelineViaWorker(prompt, tier, () => {})
  }

  let imageUrl = ''
  if (import.meta.env.VITE_PRODIA_API_KEY) {
    imageUrl = await generateWithProdia(prompt + ORTHO_SUFFIX)
  }

  const input = imageUrl || prompt

  if (tier === 'production' && import.meta.env.VITE_MESHY_API_KEY) {
    const glbUrl = await import('./meshy').then(m => m.convertWithMeshy(input))
    return { imageUrl, glbUrl }
  }

  if (import.meta.env.VITE_TRIPO_API_KEY) {
    const glbUrl = await convertWithTripo(input)
    return { imageUrl, glbUrl }
  }

  return { imageUrl, glbUrl: SAMPLE_GLB }
}
