/**
 * Generation pipeline — frontend entry point.
 *
 * When VITE_WORKER_URL is set: delegates entirely to the Cloudflare Worker.
 *
 * Fallback (no worker URL, local dev):
 *   draft      → Tripo AI text-to-model (~30s)
 *   production → Meshy AI text-to-3D (PBR, ~90s)
 *   no keys    → sample GLB (demo mode)
 */

import type { GenerationTier } from '../../types'

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
          provider3d: string
          imageUrl?: string
          glbUrl?: string
          error?: string
        }

        const label =
          job.status === 'converting_3d'
            ? `${job.provider3d} generating 3D model…`
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
    return runPipelineViaWorker(prompt, tier, () => {})
  }

  if (tier === 'production' && import.meta.env.VITE_MESHY_API_KEY) {
    const glbUrl = await import('./meshy').then(m => m.textToModelWithMeshy(prompt))
    return { imageUrl: '', glbUrl }
  }

  if (import.meta.env.VITE_TRIPO_API_KEY) {
    const glbUrl = await import('./tripo').then(m => m.textToModelWithTripo(prompt))
    return { imageUrl: '', glbUrl }
  }

  return { imageUrl: '', glbUrl: SAMPLE_GLB }
}
