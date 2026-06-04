/**
 * Prodia API — 2D image generation (draft seed images for the 3D pipeline).
 * Docs: https://docs.prodia.com/reference/generate
 *
 * Uses SDXL-Turbo for fast, clean orthographic seed images.
 * Polls /job/{id} until complete (typically 5–15s).
 */

const BASE = 'https://api.prodia.com/v1'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 60_000

interface ProdiaJobResponse {
  job: string
  status: 'queued' | 'generating' | 'succeeded' | 'failed'
  imageUrl?: string
}

export async function generateWithProdia(prompt: string): Promise<string> {
  const key = import.meta.env.VITE_PRODIA_API_KEY
  if (!key) throw new Error('VITE_PRODIA_API_KEY not set')

  const res = await fetch(`${BASE}/sdxl-turbo`, {
    method: 'POST',
    headers: { 'X-Prodia-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: 'shadow, background clutter, gradient, text, watermark, blur',
      width: 1024,
      height: 1024,
      steps: 8,
      cfg_scale: 2,
      sampler: 'DPM++ 2M Karras',
    }),
  })

  if (!res.ok) throw new Error(`Prodia job create failed: ${res.status}`)
  const { job } = (await res.json()) as { job: string }

  return pollProdia(job, key)
}

async function pollProdia(jobId: string, key: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(`${BASE}/job/${jobId}`, {
      headers: { 'X-Prodia-Key': key },
    })
    if (!res.ok) throw new Error(`Prodia poll failed: ${res.status}`)

    const data = (await res.json()) as ProdiaJobResponse
    if (data.status === 'succeeded' && data.imageUrl) return data.imageUrl
    if (data.status === 'failed') throw new Error('Prodia generation failed')
  }

  throw new Error('Prodia timed out')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
