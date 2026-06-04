/**
 * Tripo AI — image-to-3D, draft tier (~8s, "Smart Low Poly" output).
 * Docs: https://platform.tripo3d.ai/docs/api-reference
 *
 * Flow: POST /v2/openapi/task (image_to_model) -> poll until success -> return model_url (GLB).
 */

const BASE = 'https://platform.tripo3d.ai/v2/openapi'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 120_000

interface TripoTaskResponse {
  code: number
  data: {
    task_id: string
    status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
    progress?: number
    output?: {
      model: string       // GLB download URL
      rendered_image?: string
    }
  }
}

export async function convertWithTripo(imageUrl: string): Promise<string> {
  const key = import.meta.env.VITE_TRIPO_API_KEY
  if (!key) throw new Error('VITE_TRIPO_API_KEY not set')

  const res = await fetch(`${BASE}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'image_to_model',
      file: { type: 'url', url: imageUrl },
      model_version: 'v2.0-20240919',
      face_limit: 10000,
      texture: true,
      pbr: false,
    }),
  })

  if (!res.ok) throw new Error(`Tripo task create failed: ${res.status}`)
  const { data } = (await res.json()) as TripoTaskResponse
  return pollTripo(data.task_id, key)
}

async function pollTripo(taskId: string, key: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(`${BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`Tripo poll failed: ${res.status}`)

    const { data } = (await res.json()) as TripoTaskResponse
    if (data.status === 'success' && data.output?.model) return data.output.model
    if (data.status === 'failed' || data.status === 'cancelled')
      throw new Error(`Tripo task ${data.status}`)
  }

  throw new Error('Tripo timed out')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
