/**
 * useDeltaLogger — fires a silent POST /delta to the Worker after every
 * transform change, capturing the before/after training triplet.
 *
 * Uses a debounce so rapid slider drags emit one record per gesture,
 * not one per pixel. No-ops gracefully when VITE_WORKER_URL is unset.
 */

import { useEffect, useRef } from 'react'
import { useStudio } from '../store'
import type { TransformState } from '../types'

const DEBOUNCE_MS = 1200

function workerUrl(): string {
  return (import.meta.env.VITE_WORKER_URL ?? '').trim()
}

async function postDelta(payload: object): Promise<void> {
  const base = workerUrl()
  if (!base) return
  try {
    await fetch(`${base}/delta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Non-blocking — logging failures must never disrupt the studio
  }
}

// Called directly from ChatBar when a text command causes a transform change,
// so the actionText is captured alongside the before/after vectors.
export async function logChatDelta(
  assetId: string,
  prompt: string,
  actionText: string,
  before: TransformState,
  after: TransformState,
  glbUrl: string,
): Promise<void> {
  await postDelta({ assetId, prompt, actionText, before, after, glbUrl })
}

export function useDeltaLogger(): void {
  const { assets, activeAssetId } = useStudio()
  const active = assets.find(a => a.id === activeAssetId)

  // Track the "before" snapshot — updated only after a debounced write
  const committedRef = useRef<TransformState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevAssetIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Reset baseline when the active asset changes
    if (active?.id !== prevAssetIdRef.current) {
      committedRef.current = active ? { ...active.transforms } : null
      prevAssetIdRef.current = active?.id ?? null
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    if (!active || active.status !== 'ready' || !active.glbUrl) return

    const before = committedRef.current
    if (!before) {
      committedRef.current = { ...active.transforms }
      return
    }

    const after = active.transforms
    const changed = (Object.keys(after) as (keyof TransformState)[]).some(
      k => Math.abs(after[k] - before[k]) > 0.001,
    )
    if (!changed) return

    // Debounce — wait for slider to settle before writing
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const snapshot = { ...active.transforms }
      postDelta({
        assetId: active.id,
        prompt: active.prompt,
        before,
        after: snapshot,
        glbUrl: active.glbUrl,
      })
      // Advance the baseline to the committed state
      committedRef.current = snapshot
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [active, active?.transforms])
}
