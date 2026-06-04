/**
 * Meshy AI — image-to-3D, production tier (PBR textures, high-fidelity geometry).
 * Docs: https://docs.meshy.ai/api-image-to-3d
 *
 * Routed for: complex organic shapes, hero assets, final export polish.
 * Slower than Tripo (~60–120s) but produces richer PBR materials.
 */

const BASE = 'https://api.meshy.ai/v2'
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 180_000

interface MeshyTask {
  id: string
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
  progress?: number
  model_urls?: {
    glb?: string
    fbx?: string
    obj?: string
    usdz?: string
  }
}

export async function convertWithMeshy(imageUrl: string): Promise<string> {
  const key = import.meta.env.VITE_MESHY_API_KEY
  if (!key) throw new Error('VITE_MESHY_API_KEY not set')

  const res = await fetch(`${BASE}/image-to-3d`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      enable_pbr: true,
      ai_model: 'meshy-4',
    }),
  })

  if (!res.ok) throw new Error(`Meshy task create failed: ${res.status}`)
  const { result: taskId } = (await res.json()) as { result: string }
  return pollMeshy(taskId, key)
}

async function pollMeshy(taskId: string, key: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(`${BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`Meshy poll failed: ${res.status}`)

    const task = (await res.json()) as MeshyTask
    if (task.status === 'SUCCEEDED' && task.model_urls?.glb) return task.model_urls.glb
    if (task.status === 'FAILED' || task.status === 'EXPIRED')
      throw new Error(`Meshy task ${task.status}`)
  }

  throw new Error('Meshy timed out')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
