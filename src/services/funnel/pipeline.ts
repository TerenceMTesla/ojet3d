/**
 * Generation pipeline: routes prompts through available free-tier APIs.
 * Tier routing: draft (fast/free) -> production (high-fidelity).
 *
 * In MVP mode all generation is simulated with placeholder assets.
 * Replace stub functions with real API keys + webhook handling per provider.
 */

import type { GenerationTier } from '../../types'

const ORTHO_SUFFIX =
  ', isolated on solid neutral background, orthographic projection, studio lighting, no shadows, clean asset'

export async function generateImage(prompt: string): Promise<string> {
  // TODO: replace with NightCafe / Prodia API call
  // Endpoint: POST https://api.prodia.com/v1/job  or NightCafe REST
  const enhanced = prompt + ORTHO_SUFFIX
  console.log('[Funnel] 2D generation prompt:', enhanced)

  // Placeholder: return a public demo GLB directly for MVP
  return ''
}

export async function convertTo3D(
  imageUrl: string,
  tier: GenerationTier,
): Promise<string> {
  // TODO: draft tier -> self-hosted Hunyuan3D / Stable Fast 3D via GPU endpoint
  //       production tier -> Tripo AI / Meshy AI API
  console.log('[Funnel] 3D conversion', { imageUrl, tier })

  // Placeholder GLB from Khronos sample assets
  return 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb'
}

export async function runPipeline(
  prompt: string,
  tier: GenerationTier,
): Promise<{ imageUrl: string; glbUrl: string }> {
  const imageUrl = await generateImage(prompt)
  const glbUrl = await convertTo3D(imageUrl, tier)
  return { imageUrl, glbUrl }
}
