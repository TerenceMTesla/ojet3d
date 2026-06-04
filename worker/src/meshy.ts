const BASE = 'https://api.meshy.ai/v2'

export async function convertWithMeshy(
  imageUrl: string,
  apiKey: string,
  webhookUrl?: string,
): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    image_url: imageUrl,
    enable_pbr: true,
    ai_model: 'meshy-4',
  }
  if (webhookUrl) body.webhook_url = webhookUrl

  const res = await fetch(`${BASE}/image-to-3d`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Meshy create failed: ${res.status}`)
  const { result: taskId } = await res.json() as { result: string }
  return { taskId }
}

export async function pollMeshy(taskId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    await sleep(5000)
    const res = await fetch(`${BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`Meshy poll failed: ${res.status}`)
    const task = await res.json() as { status: string; model_urls?: { glb?: string } }
    if (task.status === 'SUCCEEDED' && task.model_urls?.glb) return task.model_urls.glb
    if (task.status === 'FAILED' || task.status === 'EXPIRED')
      throw new Error(`Meshy task ${task.status}`)
  }
  throw new Error('Meshy timed out')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
