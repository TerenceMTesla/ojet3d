import { create } from 'zustand'
import type { Asset, ChatMessage, TransformState } from '../types'

const defaultTransforms = (): TransformState => ({
  twist: 0,
  taper: 0,
  bend: 0,
  smooth: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
})

interface StudioState {
  assets: Asset[]
  activeAssetId: string | null
  chatMessages: ChatMessage[]
  isGenerating: boolean
  isChatOpen: boolean

  addAsset: (asset: Asset) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  setActiveAsset: (id: string | null) => void
  applyTransform: (id: string, patch: Partial<TransformState>) => void
  addChatMessage: (msg: ChatMessage) => void
  setGenerating: (v: boolean) => void
  toggleChat: () => void
}

export const useStudio = create<StudioState>((set) => ({
  assets: [],
  activeAssetId: null,
  chatMessages: [],
  isGenerating: false,
  isChatOpen: true,

  addAsset: (asset) =>
    set((s) => ({ assets: [...s.assets, asset] })),

  updateAsset: (id, patch) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  setActiveAsset: (id) => set({ activeAssetId: id }),

  applyTransform: (id, patch) =>
    set((s) => ({
      assets: s.assets.map((a) =>
        a.id === id
          ? { ...a, transforms: { ...a.transforms, ...patch } }
          : a,
      ),
    })),

  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  setGenerating: (v) => set({ isGenerating: v }),
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),
}))

export { defaultTransforms }
