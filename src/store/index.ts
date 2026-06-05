import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
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
  generatingLabel: string
  isChatOpen: boolean

  addAsset: (asset: Asset) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  removeAsset: (id: string) => void
  setActiveAsset: (id: string | null) => void
  applyTransform: (id: string, patch: Partial<TransformState>) => void
  addChatMessage: (msg: ChatMessage) => void
  setGenerating: (v: boolean, label?: string) => void
  toggleChat: () => void
}

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      assets: [],
      activeAssetId: null,
      chatMessages: [],
      isGenerating: false,
      generatingLabel: '',
      isChatOpen: true,

      addAsset: (asset) => set((s) => ({ assets: [...s.assets, asset] })),

      updateAsset: (id, patch) =>
        set((s) => ({
          assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      removeAsset: (id) =>
        set((s) => ({
          assets: s.assets.filter((a) => a.id !== id),
          activeAssetId: s.activeAssetId === id ? null : s.activeAssetId,
        })),

      setActiveAsset: (id) => set({ activeAssetId: id }),

      applyTransform: (id, patch) =>
        set((s) => ({
          assets: s.assets.map((a) =>
            a.id === id ? { ...a, transforms: { ...a.transforms, ...patch } } : a,
          ),
        })),

      addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

      setGenerating: (v, label = '') => set({ isGenerating: v, generatingLabel: label }),
      toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),
    }),
    {
      name: 'ojet3d-studio',
      storage: createJSONStorage(() => localStorage),
      // Persist only the durable asset library + last active — not transient UI state
      partialize: (s) => ({
        assets: s.assets.filter((a) => a.status === 'ready' && !!a.glbUrl),
        activeAssetId: s.activeAssetId,
      }),
    },
  ),
)

export { defaultTransforms }
