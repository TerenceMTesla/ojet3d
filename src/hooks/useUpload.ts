import { useStudio, defaultTransforms } from '../store'
import type { Asset, AssetFileType } from '../types'

const ACCEPTED = [
  '.glb', '.gltf', '.obj', '.stl',
  '.png', '.jpg', '.jpeg', '.webp', '.avif',
]

export function useUpload() {
  const { addAsset, setActiveAsset } = useStudio()

  function fileTypeFromName(name: string): AssetFileType | null {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'glb') return 'glb'
    if (ext === 'gltf') return 'gltf'
    if (ext === 'obj') return 'obj'
    if (ext === 'stl') return 'stl'
    if (['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(ext)) return 'image'
    return null
  }

  function handleFile(file: File) {
    const fileType = fileTypeFromName(file.name)
    if (!fileType) {
      alert(`Unsupported file type. Accepted: ${ACCEPTED.join(', ')}`)
      return
    }

    const blobUrl = URL.createObjectURL(file)
    const asset: Asset = {
      id: crypto.randomUUID(),
      prompt: file.name,
      glbUrl: blobUrl,
      fileType,
      status: 'ready',
      tier: 'draft',
      createdAt: Date.now(),
      transforms: defaultTransforms(),
    }
    addAsset(asset)
    setActiveAsset(asset.id)
  }

  function openPicker() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPTED.join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) handleFile(file)
    }
    input.click()
  }

  return { openPicker, handleFile, accepted: ACCEPTED }
}
