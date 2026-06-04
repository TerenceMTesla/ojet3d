/**
 * Generation pipeline — orchestrates the 2D→3D funnel.
 *
 * Tier routing:
 *   draft      → Prodia (image) + Tripo AI (3D, ~8s, low-poly)
 *   production → Prodia (image) + Meshy AI (3D, ~90s, PBR)
 *
 * Key detection: if API keys are absent, falls back to a sample GLB so the
 * studio remains functional without credentials (dev / demo mode).
 */

import type { GenerationTier } from '../../types'
import { generateWithProdia } from './prodia'
import { convertWithTripo } from './tripo'
import { convertWithMeshy } from './meshy'

const ORTHO_SUFFIX =
  ', isolated on solid neutral background, orthographic projection, uniform studio lighting, no shadows, no background, clean 3D-ready asset'

const SAMPLE_GLB =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb'

function hasKey(key: string | undefined): key is string {
  return typeof key === 'string' && key.trim().length > 0
}

export async function generateImage(prompt: string): Promise<string> {
  if (!hasKey(import.meta.env.VITE_PRODIA_API_KEY)) {
    console.warn('[Funnel] No Prodia key — skipping 2D generation, using direct text-to-3D path')
    return ''
  }
  return generateWithProdia(prompt + ORTHO_SUFFIX)
}

export async function convertTo3D(
  imageUrl: string,
  tier: GenerationTier,
): Promise<string> {
  if (tier === 'production') {
    if (!hasKey(import.meta.env.VITE_MESHY_API_KEY)) {
      console.warn('[Funnel] No Meshy key — falling back to Tripo for production tier')
    } else {
      return convertWithMeshy(imageUrl)
    }
  }

  if (!hasKey(import.meta.env.VITE_TRIPO_API_KEY)) {
    console.warn('[Funnel] No Tripo key — using sample GLB (demo mode)')
    return SAMPLE_GLB
  }

  return convertWithTripo(imageUrl)
}

export async function runPipeline(
  prompt: string,
  tier: GenerationTier,
): Promise<{ imageUrl: string; glbUrl: string }> {
  const imageUrl = await generateImage(prompt)
  const glbUrl = await convertTo3D(imageUrl || prompt, tier)
  return { imageUrl, glbUrl }
}
