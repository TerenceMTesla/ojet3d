/**
 * Pollinations.ai — free, no-key image generation.
 * https://pollinations.ai/p — stable URL that resolves to a generated image.
 * Tripo/Meshy fetch the image themselves, so we just return the URL.
 */

const BASE = 'https://image.pollinations.ai/prompt'
const ORTHO_SUFFIX =
  ', isolated on solid neutral background, orthographic projection, uniform studio lighting, no shadows, clean 3D-ready asset, product render'

export async function generateWithPollinations(prompt: string): Promise<string> {
  const enhanced = encodeURIComponent(prompt + ORTHO_SUFFIX)
  // width/height/seed for determinism; model=flux for best quality on free tier
  const url = `${BASE}/${enhanced}?width=1024&height=1024&model=flux&seed=42`

  // Trigger generation — Pollinations lazily renders on first GET.
  // We wait for it to resolve so the URL is warm before Tripo fetches it.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ojet3d-worker/1.0' },
  })
  if (!res.ok) throw new Error(`Pollinations failed: ${res.status}`)

  // Consume body so the connection closes cleanly inside the Worker
  await res.arrayBuffer()

  return url
}
