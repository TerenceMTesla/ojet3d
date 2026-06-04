/**
 * UniversalAdapter — normalizes all incoming 3D assets to GLB regardless of source.
 * Tripo / Meshy / Hunyuan3D all output different container formats;
 * this layer ensures the viewport always receives a consistent GLB stream.
 */

export type SupportedFormat = 'glb' | 'gltf' | 'obj' | 'fbx'

export interface AdaptedAsset {
  glbUrl: string
  format: SupportedFormat
  sourceName: string
}

function detectFormat(url: string): SupportedFormat {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'glb') return 'glb'
  if (ext === 'gltf') return 'gltf'
  if (ext === 'obj') return 'obj'
  if (ext === 'fbx') return 'fbx'
  return 'glb'
}

export async function adapt(
  rawUrl: string,
  sourceName: string,
): Promise<AdaptedAsset> {
  const format = detectFormat(rawUrl)

  if (format === 'glb' || format === 'gltf') {
    // Already compatible — pass through
    return { glbUrl: rawUrl, format, sourceName }
  }

  // TODO: For OBJ/FBX, call a server-side conversion endpoint (e.g. via Assimp / three-stdlib)
  // and return the resulting GLB URL. For now, pass through with a warning.
  console.warn('[Adapter] Non-GLB format detected, passing through raw URL:', format)
  return { glbUrl: rawUrl, format, sourceName }
}
