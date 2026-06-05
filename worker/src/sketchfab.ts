/**
 * Sketchfab — search 1M+ free CC-licensed 3D models by text prompt.
 * Docs: https://docs.sketchfab.com/data-api/v3/index.html
 *
 * Strategy:
 *   1. Search for downloadable models matching the prompt
 *   2. Walk results in order until we find one whose download bundle contains
 *      a direct .glb file (most popular Sketchfab models ship as GLB inside
 *      their gltf-flavored ZIP)
 *   3. Stream the GLB bytes back to the caller
 *
 * If no GLB found in the first batch, returns null (caller falls back to sample).
 */

import { unzipSync } from 'fflate'

const BASE = 'https://api.sketchfab.com/v3'

interface SearchResult {
  uid: string
  name: string
  user: { username: string }
  license?: { label: string }
}

interface DownloadBundle {
  gltf?: { url: string; size: number; expires: string }
  glb?:  { url: string; size: number; expires: string }
}

// Common adjectives Sketchfab doesn't index well — strip them when refining
const ADJECTIVE_STOPWORDS = new Set([
  'a', 'an', 'the', 'create', 'make', 'generate', 'build', 'new', 'of', 'from',
  'epic', 'awesome', 'cool', 'badass', 'sick', 'amazing', 'super', 'mega',
  'spiritual', 'mystical', 'magical', 'futuristic', 'utopian', 'dystopian',
  'cyber', 'cyberpunk', 'steampunk', 'fantasy', 'sci-fi', 'scifi',
  'beautiful', 'pretty', 'ugly', 'small', 'big', 'huge', 'tiny', 'large',
  'old', 'ancient', 'modern', 'cute', 'scary', 'dark', 'bright', 'colorful',
  'realistic', 'stylized', 'low-poly', 'lowpoly', 'high-poly',
])

function extractKeywords(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !ADJECTIVE_STOPWORDS.has(w))
}

async function searchSketchfab(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = new URL(`${BASE}/search`)
  url.searchParams.set('type', 'models')
  url.searchParams.set('q', query)
  url.searchParams.set('downloadable', 'true')
  url.searchParams.set('count', '10')
  url.searchParams.set('archives_flavours', 'true')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`Sketchfab search failed: ${res.status} ${await res.text()}`)
  }
  const { results } = await res.json() as { results: SearchResult[] }
  return results ?? []
}

/**
 * Search and gather a pool of viable candidates (without downloading them yet).
 * Used by the variant swap flow so we can rotate through alternates without
 * re-running the search.
 */
export async function gatherCandidates(
  prompt: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const keywords = extractKeywords(prompt)
  const queries = [
    prompt,
    keywords.join(' '),
    ...keywords.slice().reverse(),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i)

  for (const query of queries) {
    const results = await searchSketchfab(query, apiKey)
    if (results.length) return results
  }
  return []
}

/**
 * Download the GLB for a specific Sketchfab UID. Returns null if the model
 * isn't packaged with a usable GLB.
 */
export async function downloadCandidateGLB(
  uid: string,
  apiKey: string,
): Promise<Uint8Array | null> {
  try {
    return await tryDownloadGLB(uid, apiKey)
  } catch (err) {
    console.warn(`[Sketchfab] download failed for ${uid}:`, err)
    return null
  }
}

export async function searchAndFetchGLB(
  prompt: string,
  apiKey: string,
): Promise<{
  bytes: Uint8Array
  modelName: string
  author: string
  candidates: SearchResult[]
  pickedIndex: number
} | null> {
  const candidates = await gatherCandidates(prompt, apiKey)
  if (!candidates.length) return null

  for (let i = 0; i < candidates.length; i++) {
    const result = candidates[i]
    const glb = await downloadCandidateGLB(result.uid, apiKey)
    if (glb) {
      return {
        bytes: glb,
        modelName: result.name,
        author: result.user.username,
        candidates,
        pickedIndex: i,
      }
    }
  }
  return null
}

// Cloudflare KV caps each value at 25 MiB. Skip any candidate whose GLB
// (or gltf bundle) would exceed that — we'll fall through to the next match.
const MAX_BYTES = 24 * 1024 * 1024

async function tryDownloadGLB(uid: string, apiKey: string): Promise<Uint8Array | null> {
  // Get signed download URLs for this model
  const dlRes = await fetch(`${BASE}/models/${uid}/download`, {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!dlRes.ok) return null
  const bundle = await dlRes.json() as DownloadBundle

  // Prefer direct GLB if available
  if (bundle.glb?.url) {
    if (bundle.glb.size > MAX_BYTES) {
      console.warn(`[Sketchfab] ${uid} GLB too large (${bundle.glb.size} bytes), skipping`)
      return null
    }
    const res = await fetch(bundle.glb.url)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  }

  // Otherwise fall back to gltf ZIP and look for .glb inside.
  // The ZIP size hints at the contained GLB size — if the whole bundle already
  // exceeds the cap, the inner GLB definitely will.
  if (!bundle.gltf?.url) return null
  if (bundle.gltf.size > MAX_BYTES) {
    console.warn(`[Sketchfab] ${uid} gltf bundle too large (${bundle.gltf.size} bytes), skipping`)
    return null
  }
  const zipRes = await fetch(bundle.gltf.url)
  if (!zipRes.ok) return null

  const zipBuf = new Uint8Array(await zipRes.arrayBuffer())
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBuf)
  } catch {
    return null
  }

  // Find any .glb in the archive — reject if it would blow KV's limit
  for (const [name, data] of Object.entries(files)) {
    if (name.toLowerCase().endsWith('.glb')) {
      if (data.byteLength > MAX_BYTES) {
        console.warn(`[Sketchfab] ${uid} extracted GLB too large (${data.byteLength} bytes), skipping`)
        return null
      }
      return data
    }
  }
  return null
}
