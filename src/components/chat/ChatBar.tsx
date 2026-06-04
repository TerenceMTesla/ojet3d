import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'
import { useStudio } from '../../store'
import { parseMutation } from '../../utils/parseMutation'
import { runPipeline } from '../../services/funnel/pipeline'
import { adapt } from '../../services/adapters/UniversalAdapter'
import { defaultTransforms } from '../../store'
import type { Asset, ChatMessage } from '../../types'

function isGenerationIntent(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.startsWith('create') ||
    t.startsWith('generate') ||
    t.startsWith('make a') ||
    t.startsWith('build') ||
    t.startsWith('new ') ||
    t.includes('generate a') ||
    t.includes('create a')
  )
}

export default function ChatBar() {
  const [input, setInput] = useState('')
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

    if (isGenerationIntent(text)) {
      const hasProdiaKey = !!import.meta.env.VITE_PRODIA_API_KEY
      const hasTripoKey = !!import.meta.env.VITE_TRIPO_API_KEY
      const provider2d = hasProdiaKey ? 'Prodia' : 'demo mode'
      const provider3d = hasTripoKey ? 'Tripo AI' : 'sample GLB'

      setGenerating(true, `${provider2d} → ${provider3d}`)
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Pipeline active: ${provider2d} (2D) → ${provider3d} (3D). This may take up to 60s with live keys…`,
        timestamp: Date.now(),
      })

      try {
        const assetId = crypto.randomUUID()
        const placeholder: Asset = {
          id: assetId,
          prompt: text,
          status: 'generating_2d',
          tier: 'draft',
          createdAt: Date.now(),
          transforms: defaultTransforms(),
        }
        addAsset(placeholder)
        setActiveAsset(assetId)

        setGenerating(true, hasProdiaKey ? 'Prodia generating image…' : 'Skipping 2D (no key)')
        updateAsset(assetId, { status: 'generating_2d' })

        const { imageUrl, glbUrl: rawGlb } = await runPipeline(text, 'draft')

        setGenerating(true, hasTripoKey ? 'Tripo AI converting to 3D…' : 'Loading sample GLB…')
        updateAsset(assetId, { status: 'converting_3d' })

        const adapted = await adapt(rawGlb, provider3d)
        updateAsset(assetId, { imageUrl, glbUrl: adapted.glbUrl, status: 'ready' })

        addChatMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Asset ready via ${provider3d}! Use the sliders or chat to modify it.`,
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
        applyTransform(activeAssetId, mutations)
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
