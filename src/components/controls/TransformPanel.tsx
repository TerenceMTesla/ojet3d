import { useStudio } from '../../store'
import type { TransformState } from '../../types'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-studio-muted">{label}</span>
        <span className="text-studio-accent font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-violet-600 h-1 rounded"
      />
    </div>
  )
}

export default function TransformPanel() {
  const { assets, activeAssetId, applyTransform } = useStudio()
  const active = assets.find((a) => a.id === activeAssetId)

  if (!active) {
    return (
      <div className="p-4 text-studio-muted text-xs text-center">
        Generate or select an asset to edit transforms
      </div>
    )
  }

  const t = active.transforms
  const set = (patch: Partial<TransformState>) => applyTransform(active.id, patch)

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Deform</p>
      <Slider label="Twist" value={t.twist} min={-1} max={1} step={0.01} onChange={(v) => set({ twist: v })} />
      <Slider label="Taper" value={t.taper} min={-1} max={1} step={0.01} onChange={(v) => set({ taper: v })} />
      <Slider label="Bend" value={t.bend} min={-1} max={1} step={0.01} onChange={(v) => set({ bend: v })} />
      <Slider label="Smooth" value={t.smooth} min={0} max={1} step={0.01} onChange={(v) => set({ smooth: v })} />

      <p className="text-xs font-semibold text-studio-muted uppercase tracking-wider mt-2">Scale</p>
      <Slider label="Scale X" value={t.scaleX} min={0.1} max={3} step={0.01} onChange={(v) => set({ scaleX: v })} />
      <Slider label="Scale Y" value={t.scaleY} min={0.1} max={3} step={0.01} onChange={(v) => set({ scaleY: v })} />
      <Slider label="Scale Z" value={t.scaleZ} min={0.1} max={3} step={0.01} onChange={(v) => set({ scaleZ: v })} />

      <button
        onClick={() =>
          set({ twist: 0, taper: 0, bend: 0, smooth: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
        }
        className="mt-2 text-xs text-studio-muted hover:text-studio-text border border-studio-border rounded px-3 py-1.5 transition"
      >
        Reset Transforms
      </button>
    </div>
  )
}
