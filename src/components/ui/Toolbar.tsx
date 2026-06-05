import { MessageSquare, Download, Layers, Focus } from 'lucide-react'
import { useStudio } from '../../store'

export default function Toolbar() {
  const { toggleChat, isChatOpen, assets, activeAssetId } = useStudio()
  const active = assets.find((a) => a.id === activeAssetId)

  const downloadGlb = () => {
    if (!active?.glbUrl) return
    const a = document.createElement('a')
    a.href = active.glbUrl
    a.download = `${active.prompt.slice(0, 30).replace(/\s+/g, '_')}.glb`
    a.click()
  }

  return (
    <div className="h-12 flex items-center justify-between px-4 border-b border-studio-border bg-studio-panel shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-studio-accent flex items-center justify-center">
          <Layers size={12} />
        </div>
        <span className="text-sm font-semibold tracking-tight text-studio-text">Ojet3D</span>
        <span className="text-studio-muted text-xs ml-2">Creator Studio</span>
      </div>

      <div className="flex items-center gap-2">
        {active?.glbUrl && (
          <>
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
