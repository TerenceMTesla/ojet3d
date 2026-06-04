const BASE = 'https://api.prodia.com/v1'
const ORTHO_SUFFIX =
  ', isolated on solid neutral background, orthographic projection, uniform studio lighting, no shadows, no background clutter, clean 3D-ready asset'

export async function generateImage(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(`${BASE}/sdxl-turbo`, {
    method: 'POST',
    headers: { 'X-Prodia-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt + ORTHO_SUFFIX,
      negative_prompt: 'shadow, gradient, text, watermark, blur, background',
      width: 1024,
      height: 1024,
      steps: 8,
      cfg_scale: 2,
      sampler: 'DPM++ 2M Karras',
    }),
  })
  if (!res.ok) throw new Error(`Prodia create failed: ${res.status}`)
  const { job } = await res.json() as { job: string }
  return pollProdia(job, apiKey)
}

async function pollProdia(jobId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await sleep(2500)
    const res = await fetch(`${BASE}/job/${jobId}`, {
      headers: { 'X-Prodia-Key': apiKey },
    })
    if (!res.ok) throw new Error(`Prodia poll failed: ${res.status}`)
    const data = await res.json() as { status: string; imageUrl?: string }
    if (data.status === 'succeeded' && data.imageUrl) return data.imageUrl
    if (data.status === 'failed') throw new Error('Prodia generation failed')
  }
  throw new Error('Prodia timed out')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
