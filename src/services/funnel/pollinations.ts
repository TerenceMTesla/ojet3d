/**
 * Pollinations.ai — free, no-key image generation.
 * Returns a stable URL the 3D providers can fetch directly.
 */

const BASE = 'https://image.pollinations.ai/prompt'
const ORTHO_SUFFIX =
  ', isolated on solid neutral background, orthographic projection, uniform studio lighting, no shadows, clean 3D-ready asset, product render'

export async function generateWithPollinations(prompt: string): Promise<string> {
  const enhanced = encodeURIComponent(prompt + ORTHO_SUFFIX)
  const url = `${BASE}/${enhanced}?width=1024&height=1024&model=flux&seed=42`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pollinations failed: ${res.status}`)
  await res.arrayBuffer()

  return url
}
