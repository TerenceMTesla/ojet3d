import { useStudio } from '../../store'
import { Loader2, CheckCircle, AlertCircle, Image } from 'lucide-react'

export default function AssetList() {
  const { assets, activeAssetId, setActiveAsset } = useStudio()

  if (assets.length === 0) {
    return (
      <div className="p-4 text-studio-muted text-xs text-center">
        No assets yet — generate one via the chat bar
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {assets.map((a) => (
        <button
          key={a.id}
          onClick={() => setActiveAsset(a.id)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
            a.id === activeAssetId
              ? 'bg-studio-accent text-white'
              : 'bg-studio-panel text-studio-text hover:bg-studio-border'
          }`}
        >
          <span className="shrink-0">
            {a.status === 'ready' && <CheckCircle size={12} className="text-green-400" />}
            {(a.status === 'generating_2d' || a.status === 'converting_3d') && (
              <Loader2 size={12} className="animate-spin text-studio-accent2" />
            )}
            {a.status === 'error' && <AlertCircle size={12} className="text-red-400" />}
            {a.status === 'idle' && <Image size={12} className="text-studio-muted" />}
          </span>
          <span className="truncate">{a.prompt}</span>
        </button>
      ))}
    </div>
  )
}
