const BASE = 'https://platform.tripo3d.ai/v2/openapi'

/**
 * Text-to-3D — send prompt directly, no image step needed.
 * Tripo v2 natively supports text_to_model.
 */
export async function textToModelWithTripo(
  prompt: string,
  apiKey: string,
  webhookUrl?: string,
): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    type: 'text_to_model',
    prompt,
    model_version: 'v2.0-20240919',
    face_limit: 10000,
    texture: true,
    pbr: false,
  }
  if (webhookUrl) body.callback_url = webhookUrl

  const res = await fetch(`${BASE}/task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Tripo create failed: ${res.status} — ${text}`)
  }
  const { data } = await res.json() as { data: { task_id: string } }
  return { taskId: data.task_id }
}

/**
 * Image-to-3D — for when the user uploads their own reference image.
 */
export async function convertWithTripo(
  imageUrl: string,
  apiKey: string,
  webhookUrl?: string,
): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    type: 'image_to_model',
    file: { type: 'url', url: imageUrl },
    model_version: 'v2.0-20240919',
    face_limit: 10000,
    texture: true,
    pbr: false,
  }
  if (webhookUrl) body.callback_url = webhookUrl

  const res = await fetch(`${BASE}/task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tripo create failed: ${res.status}`)
  const { data } = await res.json() as { data: { task_id: string } }
  return { taskId: data.task_id }
}

export async function pollTripo(taskId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    await sleep(3000)
    const res = await fetch(`${BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`Tripo poll failed: ${res.status}`)
    const { data } = await res.json() as {
      data: { status: string; output?: { model: string } }
    }
    if (data.status === 'success' && data.output?.model) return data.output.model
    if (data.status === 'failed' || data.status === 'cancelled')
      throw new Error(`Tripo task ${data.status}`)
  }
  throw new Error('Tripo timed out')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
