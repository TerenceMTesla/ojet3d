import { useState } from 'react'
import { MessageSquare, Download, Layers, Focus, Shuffle, Trash2, Loader2, Upload } from 'lucide-react'
import { useStudio } from '../../store'
import { swapVariant } from '../../services/funnel/pipeline'
import { useUpload } from '../../hooks/useUpload'

export default function Toolbar() {
  const { toggleChat, isChatOpen, assets, activeAssetId, updateAsset, removeAsset } = useStudio()
  const [swapping, setSwapping] = useState(false)
  const { openPicker } = useUpload()
  const active = assets.find((a) => a.id === activeAssetId)

  const downloadGlb = () => {
    if (!active?.glbUrl) return
    const a = document.createElement('a')
    a.href = active.glbUrl
    a.download = `${active.prompt.slice(0, 30).replace(/\s+/g, '_')}.glb`
    a.click()
  }

  const tryAnotherVariant = async () => {
    if (!active?.jobId || swapping) return
    setSwapping(true)
    try {
      const result = await swapVariant(active.jobId)
      if (result) {
        updateAsset(active.id, {
          glbUrl: result.glbUrl,
          variantIndex: result.variantIndex,
          variantName: result.variantName,
        })
      }
    } finally {
      setSwapping(false)
    }
  }

  const deleteActive = () => {
    if (!active) return
    if (!confirm(`Delete "${active.prompt}"? This removes it from your library.`)) return
    removeAsset(active.id)
  }

  const hasVariants = !!active?.jobId && (active?.variantCount ?? 0) > 1

  return (
    <div className="h-12 flex items-center justify-between px-4 border-b border-studio-border bg-studio-panel shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-studio-accent flex items-center justify-center">
          <Layers size={12} />
        </div>
        <span className="text-sm font-semibold tracking-tight text-studio-text">Ojet3D</span>
        <span className="text-studio-muted text-xs ml-2">Creator Studio</span>
        {active?.variantName && (
          <span className="text-studio-muted text-xs ml-3 hidden md:inline">
            · <span className="text-studio-text">{active.variantName}</span>
            {active.variantAuthor && <span className="text-studio-muted"> by {active.variantAuthor}</span>}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={openPicker}
          className="flex items-center gap-1.5 text-xs text-studio-muted hover:text-studio-text border border-studio-border rounded px-2.5 py-1 transition"
          title="Upload GLB, GLTF, OBJ, STL, or image"
        >
          <Upload size={12} />
          Upload
        </button>
        {active?.glbUrl && (
          <>
            {hasVariants && (
              <button
                onClick={tryAnotherVariant}
                disabled={swapping}
                className="flex items-center gap-1.5 text-xs text-studio-muted hover:text-studio-text border border-studio-border rounded px-2.5 py-1 transition disabled:opacity-50"
                title="Swap to next Sketchfab match for this prompt"
              >
                {swapping ? <Loader2 size={12} className="animate-spin" /> : <Shuffle size={12} />}
                Try Another
                <span className="text-studio-muted">
                  {(active.variantIndex ?? 0) + 1}/{active.variantCount}
                </span>
              </button>
            )}
            <button
              onClick={() => (window as unknown as { __ojet3dFitCamera?: () => void }).__ojet3dFitCamera?.()}
              className="flex items-center gap-1.5 text-xs text-studio-muted hover:text-studio-text border border-studio-border rounded px-2.5 py-1 transition"
              title="Reset camera and frame the model"
            >
              <Focus size={12} />
              Frame
            </button>
            <button
              onClick={downloadGlb}
              className="flex items-center gap-1.5 text-xs text-studio-muted hover:text-studio-text border border-studio-border rounded px-2.5 py-1 transition"
            >
              <Download size={12} />
              Export GLB
            </button>
            <button
              onClick={deleteActive}
              className="flex items-center gap-1.5 text-xs text-studio-muted hover:text-red-400 border border-studio-border rounded px-2.5 py-1 transition"
              title="Remove this asset from your library"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
        <button
          onClick={toggleChat}
          className={`flex items-center gap-1.5 text-xs rounded px-2.5 py-1 transition border ${
            isChatOpen
              ? 'bg-studio-accent border-studio-accent text-white'
              : 'border-studio-border text-studio-muted hover:text-studio-text'
          }`}
        >
          <MessageSquare size={12} />
          Chat
        </button>
      </div>
    </div>
  )
}
