import type { TransformState } from '../types'

/**
 * Parses a freeform text command from the chat bar into a TransformState patch.
 * Example: "make it 20% taller and add twist" -> { scaleY: 1.2, twist: 0.3 }
 *
 * In the full build this is replaced by an LLM tool-call that returns structured JSON.
 * This regex fallback keeps the studio functional with zero API keys.
 */
export function parseMutation(text: string): Partial<TransformState> {
  const patch: Partial<TransformState> = {}
  const t = text.toLowerCase()

  const pct = (match: RegExpMatchArray | null) =>
    match ? parseFloat(match[1]) / 100 : null

  const taller = t.match(/(\d+)\s*%\s*taller/)
  if (taller) patch.scaleY = 1 + (pct(taller) ?? 0.2)

  const shorter = t.match(/(\d+)\s*%\s*shorter/)
  if (shorter) patch.scaleY = 1 - (pct(shorter) ?? 0.2)

  const wider = t.match(/(\d+)\s*%\s*wider/)
  if (wider) patch.scaleX = 1 + (pct(wider) ?? 0.2)

  const narrower = t.match(/(\d+)\s*%\s*narrower/)
  if (narrower) patch.scaleX = 1 - (pct(narrower) ?? 0.2)

  if (t.includes('twist')) patch.twist = 0.4
  if (t.includes('no twist') || t.includes('remove twist')) patch.twist = 0
  if (t.includes('taper')) patch.taper = 0.4
  if (t.includes('no taper') || t.includes('remove taper')) patch.taper = 0
  if (t.includes('bend')) patch.bend = 0.3
  if (t.includes('smooth')) patch.smooth = 0.5
  if (t.includes('reset')) {
    patch.twist = 0
    patch.taper = 0
    patch.bend = 0
    patch.smooth = 0
    patch.scaleX = 1
    patch.scaleY = 1
    patch.scaleZ = 1
  }

  return patch
}
