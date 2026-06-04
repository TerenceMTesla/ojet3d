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

export async function searchAndFetchGLB(
  prompt: string,
  apiKey: string,
): Promise<{ bytes: Uint8Array; modelName: string; author: string } | null> {
  // 1. Search Sketchfab for downloadable models matching the prompt
  const searchUrl = new URL(`${BASE}/search`)
  searchUrl.searchParams.set('type', 'models')
  searchUrl.searchParams.set('q', prompt)
  searchUrl.searchParams.set('downloadable', 'true')
  searchUrl.searchParams.set('count', '10')
  searchUrl.searchParams.set('archives_flavours', 'true')

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!searchRes.ok) {
    throw new Error(`Sketchfab search failed: ${searchRes.status} ${await searchRes.text()}`)
  }
  const { results } = await searchRes.json() as { results: SearchResult[] }
  if (!results.length) return null

  // 2. Walk results until we extract a usable GLB
  for (const result of results) {
    try {
      const glb = await tryDownloadGLB(result.uid, apiKey)
      if (glb) {
        return {
          bytes: glb,
          modelName: result.name,
          author: result.user.username,
        }
      }
    } catch (err) {
      console.warn(`[Sketchfab] skipping ${result.uid}:`, err)
    }
  }

  return null
}

async function tryDownloadGLB(uid: string, apiKey: string): Promise<Uint8Array | null> {
  // Get signed download URLs for this model
  const dlRes = await fetch(`${BASE}/models/${uid}/download`, {
    headers: { Authorization: `Token ${apiKey}` },
  })
  if (!dlRes.ok) return null
  const bundle = await dlRes.json() as DownloadBundle

  // Prefer direct GLB if available
  if (bundle.glb?.url) {
    const res = await fetch(bundle.glb.url)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  }

  // Otherwise fall back to gltf ZIP and look for .glb inside
  if (!bundle.gltf?.url) return null
  const zipRes = await fetch(bundle.gltf.url)
  if (!zipRes.ok) return null

  const zipBuf = new Uint8Array(await zipRes.arrayBuffer())
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBuf)
  } catch {
    return null
  }

  // Find any .glb in the archive
  for (const [name, data] of Object.entries(files)) {
    if (name.toLowerCase().endsWith('.glb')) return data
  }
  return null
}
