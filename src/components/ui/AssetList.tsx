import { useStudio } from '../../store'
import { Loader2, CheckCircle, AlertCircle, Image, Trash2, RefreshCw } from 'lucide-react'

export default function AssetList() {
  const { assets, activeAssetId, setActiveAsset, removeAsset, clearAll } = useStudio()

  const handleDelete = (e: React.MouseEvent, id: string, prompt: string) => {
    e.stopPropagation()
    if (!confirm(`Delete "${prompt}"?`)) return
    removeAsset(id)
  }

  const handleClearAll = () => {
    if (!confirm('Clear the studio? This removes all assets and chat history.')) return
    clearAll()
  }

  return (
    <div className="flex flex-col">
      {/* New Studio button */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={handleClearAll}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-studio-muted hover:text-studio-text border border-studio-border rounded-lg px-3 py-1.5 transition hover:border-red-500/50 hover:text-red-400"
          title="Clear all assets and start fresh"
        >
          <RefreshCw size={11} />
          New Studio
        </button>
      </div>

      {assets.length === 0 ? (
        <div className="p-4 text-studio-muted text-xs text-center">
          No assets yet — generate one via the chat bar
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {assets.map((a) => (
            <div
              key={a.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition cursor-pointer ${
                a.id === activeAssetId
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-panel text-studio-text hover:bg-studio-border'
              }`}
              onClick={() => setActiveAsset(a.id)}
            >
              <span className="shrink-0">
                {a.status === 'ready' && <CheckCircle size={12} className="text-green-400" />}
                {(a.status === 'generating_2d' || a.status === 'converting_3d') && (
                  <Loader2 size={12} className="animate-spin text-studio-accent2" />
                )}
                {a.status === 'error' && <AlertCircle size={12} className="text-red-400" />}
                {a.status === 'idle' && <Image size={12} className="text-studio-muted" />}
              </span>
              <span className="truncate flex-1">{a.prompt}</span>
              <button
                onClick={(e) => handleDelete(e, a.id, a.prompt)}
                className={`shrink-0 opacity-0 group-hover:opacity-100 transition rounded p-0.5 hover:text-red-400 ${
                  a.id === activeAssetId ? 'text-white/60 hover:text-red-300' : 'text-studio-muted'
                }`}
                title="Delete asset"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
