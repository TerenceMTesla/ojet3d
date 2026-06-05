import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Zap, Star } from 'lucide-react'
import type { GenerationTier } from '../../types'
import { useStudio } from '../../store'
import { parseMutation } from '../../utils/parseMutation'
import { runPipeline, runPipelineViaWorker } from '../../services/funnel/pipeline'
import { adapt } from '../../services/adapters/UniversalAdapter'
import { defaultTransforms } from '../../store'
import { logChatDelta } from '../../hooks/useDeltaLogger'
import type { Asset, ChatMessage } from '../../types'

// Transform keywords that indicate the user wants to modify an existing asset
const TRANSFORM_KEYWORDS = [
  'twist', 'taper', 'bend', 'smooth', 'scale', 'wider', 'taller', 'bigger',
  'smaller', 'rotate', 'flip', 'stretch', 'squish', 'inflate', 'shrink',
  'make it', 'more', 'less', 'add', 'remove', 'increase', 'decrease', '%',
]

function isTransformIntent(text: string): boolean {
  const t = text.toLowerCase()
  return TRANSFORM_KEYWORDS.some(kw => t.includes(kw))
}

// Anything that isn't a clear transform command is treated as a generation prompt
function isGenerationIntent(text: string, hasActiveAsset: boolean): boolean {
  if (!hasActiveAsset) return true
  return !isTransformIntent(text)
}

export default function ChatBar() {
  const [input, setInput] = useState('')
  const [tier, setTier] = useState<GenerationTier>('draft')
  const bottomRef = useRef<HTMLDivElement>(null)
  const {
    chatMessages,
    addChatMessage,
    isGenerating,
    generatingLabel,
    setGenerating,
    addAsset,
    updateAsset,
    setActiveAsset,
    activeAssetId,
    applyTransform,
  } = useStudio()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const send = async () => {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    addChatMessage(userMsg)

    if (isGenerationIntent(text, !!activeAssetId)) {
      const useWorker = !!(import.meta.env.VITE_WORKER_URL ?? '').trim()
      const hasTripoKey = !!import.meta.env.VITE_TRIPO_API_KEY
      const modeLabel = useWorker
        ? 'Sketchfab (via Worker)'
        : hasTripoKey ? 'Tripo AI text-to-3D' : 'demo mode (sample GLB)'

      setGenerating(true, modeLabel)
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: useWorker
          ? 'Job submitted to Worker — pipeline runs server-side (tab-safe). Streaming updates…'
          : `Pipeline active: ${modeLabel}. This may take up to 60s with live keys…`,
        timestamp: Date.now(),
      })

      try {
        const assetId = crypto.randomUUID()
        const placeholder: Asset = {
          id: assetId,
          prompt: text,
          status: 'generating_2d',
          tier,
          createdAt: Date.now(),
          transforms: defaultTransforms(),
        }
        addAsset(placeholder)
        setActiveAsset(assetId)

        const result = useWorker
          ? await runPipelineViaWorker(text, tier, (status, label) => {
              setGenerating(true, label)
              updateAsset(assetId, { status: status as Asset['status'] })
            })
          : (updateAsset(assetId, { status: 'generating_2d' }), await runPipeline(text))

        const adapted = await adapt(result.glbUrl, useWorker ? 'Worker' : modeLabel)
        updateAsset(assetId, {
          imageUrl: result.imageUrl,
          glbUrl: adapted.glbUrl,
          status: 'ready',
          jobId: result.jobId,
          variantIndex: result.variantIndex,
          variantCount: result.variantCount,
          variantName: result.variantName,
          variantAuthor: result.variantAuthor,
        })

        addChatMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Asset ready! Use the sliders or type commands like "make it 20% taller and add twist" to modify it.`,
          timestamp: Date.now(),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        addChatMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Pipeline error: ${msg}`,
          timestamp: Date.now(),
        })
        const activeId = useStudio.getState().activeAssetId
        if (activeId) updateAsset(activeId, { status: 'error' })
      } finally {
        setGenerating(false)
      }
      return
    }

    // Treat as a transform mutation command
    if (activeAssetId) {
      const mutations = parseMutation(text)
      if (Object.keys(mutations).length > 0) {
        const currentAsset = useStudio.getState().assets.find(a => a.id === activeAssetId)
        const beforeTransforms = currentAsset ? { ...currentAsset.transforms } : undefined
        applyTransform(activeAssetId, mutations)
        // Log this chat-driven edit with the command text captured
        if (currentAsset?.glbUrl && beforeTransforms) {
          const afterTransforms = { ...beforeTransforms, ...mutations }
          logChatDelta(
            activeAssetId, currentAsset.prompt, text,
            beforeTransforms, afterTransforms as typeof beforeTransforms,
            currentAsset.glbUrl,
          )
        }
        const keys = Object.keys(mutations).join(', ')
        addChatMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Applied: ${keys}. Use sliders to fine-tune further.`,
          timestamp: Date.now(),
          mutations,
        })
        return
      }
    }

    addChatMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'Try: "Create a futuristic helmet" to generate, or "make it 20% taller and add twist" to modify the active asset.',
      timestamp: Date.now(),
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {chatMessages.length === 0 && (
          <div className="text-studio-muted text-xs text-center mt-4 leading-relaxed">
            Type a prompt to generate a 3D asset,<br />
            or describe a modification to the active object.
          </div>
        )}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 items-start text-xs ${
              msg.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-studio-border">
              {msg.role === 'user' ? (
                <User size={12} className="text-studio-accent" />
              ) : (
                <Bot size={12} className="text-studio-accent2" />
              )}
            </div>
            <div
              className={`rounded-lg px-3 py-2 max-w-[85%] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-panel text-studio-text border border-studio-border'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-studio-border">
        {/* Draft / Final tier toggle */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setTier('draft')}
            className={`flex-1 flex items-center justify-center gap-1 text-xs rounded px-2 py-1 transition border ${
              tier === 'draft'
                ? 'bg-studio-accent border-studio-accent text-white'
                : 'border-studio-border text-studio-muted hover:text-studio-text'
            }`}
            title="Fast & free — Sketchfab library search"
          >
            <Zap size={11} />
            Draft
          </button>
          <button
            onClick={() => setTier('production')}
            className={`flex-1 flex items-center justify-center gap-1 text-xs rounded px-2 py-1 transition border ${
              tier === 'production'
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'border-studio-border text-studio-muted hover:text-studio-text'
            }`}
            title="PBR quality — Meshy AI text-to-3D generation"
          >
            <Star size={11} />
            Final
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={isGenerating ? (generatingLabel || 'Generating…') : 'Describe or modify…'}
            disabled={isGenerating}
            className="flex-1 bg-studio-bg border border-studio-border rounded-lg px-3 py-2 text-xs text-studio-text placeholder-studio-muted outline-none focus:border-studio-accent transition disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={isGenerating || !input.trim()}
            className="w-8 h-8 rounded-lg bg-studio-accent flex items-center justify-center disabled:opacity-40 transition hover:bg-violet-500"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
