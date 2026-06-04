import type { Job, Env } from './types'
import { textToModelWithTripo, pollTripo } from './tripo'
import { textToModelWithMeshy, pollMeshy } from './meshy'

/**
 * JobStore — one Durable Object instance per job (keyed by jobId).
 *
 * Responsibilities:
 *   1. Persist job state in SQLite across requests/restarts
 *   2. Run the full 2D→3D pipeline (survives tab close)
 *   3. Accept webhook callbacks from Tripo/Meshy
 *   4. Fan out Server-Sent Events to all connected browser listeners
 */
export class JobStore implements DurableObject {
  private sql: SqlStorage
  private listeners: Set<(data: string) => void> = new Set()

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.sql = state.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        tier TEXT NOT NULL,
        status TEXT NOT NULL,
        provider2d TEXT NOT NULL,
        provider3d TEXT NOT NULL,
        image_url TEXT,
        glb_url TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (action === 'init' && request.method === 'POST') {
      return this.handleInit(request)
    }
    if (action === 'status' && request.method === 'GET') {
      return this.handleSSE()
    }
    if (action === 'webhook_tripo' && request.method === 'POST') {
      return this.handleWebhookTripo(request)
    }
    if (action === 'webhook_meshy' && request.method === 'POST') {
      return this.handleWebhookMeshy(request)
    }
    if (action === 'get' && request.method === 'GET') {
      return this.handleGet()
    }

    return new Response('Not found', { status: 404 })
  }

  // ── Init: create job row + kick off pipeline in background ──────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { id: string; prompt: string; tier: string }
    const now = Date.now()
    const has3d = body.tier === 'production'
      ? !!this.env.MESHY_API_KEY
      : !!this.env.TRIPO_API_KEY

    const job: Job = {
      id: body.id,
      prompt: body.prompt,
      tier: body.tier as Job['tier'],
      status: 'queued',
      provider2d: 'text-to-3D',
      provider3d: body.tier === 'production'
        ? (has3d ? 'Meshy AI' : 'Tripo AI')
        : (has3d ? 'Tripo AI' : 'demo'),
      createdAt: now,
      updatedAt: now,
    }

    this.sql.exec(
      `INSERT INTO jobs (id, prompt, tier, status, provider2d, provider3d, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      job.id, job.prompt, job.tier, job.status,
      job.provider2d, job.provider3d, job.createdAt, job.updatedAt,
    )

    // Run pipeline without blocking the response
    this.state.waitUntil(this.runPipeline(job))

    return Response.json({ jobId: job.id })
  }

  // ── SSE stream ───────────────────────────────────────────────────────────

  private handleSSE(): Response {
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    const send = (data: string) => {
      writer.write(encoder.encode(`data: ${data}\n\n`)).catch(() => {})
    }

    // Immediately send current state
    const current = this.getJob()
    if (current) send(JSON.stringify(current))

    // Register listener for future updates
    this.listeners.add(send)

    // Clean up when client disconnects
    readable.pipeTo(new WritableStream()).catch(() => {
      this.listeners.delete(send)
      writer.close().catch(() => {})
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // ── Webhook handlers ─────────────────────────────────────────────────────

  private async handleWebhookTripo(request: Request): Promise<Response> {
    const body = await request.json() as {
      data: { status: string; output?: { model: string } }
    }
    if (body.data.status === 'success' && body.data.output?.model) {
      this.updateJob({ status: 'ready', glbUrl: body.data.output.model })
    } else if (body.data.status === 'failed') {
      this.updateJob({ status: 'failed', error: 'Tripo reported failure' })
    }
    return new Response('ok')
  }

  private async handleWebhookMeshy(request: Request): Promise<Response> {
    const body = await request.json() as {
      status: string
      model_urls?: { glb?: string }
    }
    if (body.status === 'SUCCEEDED' && body.model_urls?.glb) {
      this.updateJob({ status: 'ready', glbUrl: body.model_urls.glb })
    } else if (body.status === 'FAILED' || body.status === 'EXPIRED') {
      this.updateJob({ status: 'failed', error: `Meshy ${body.status}` })
    }
    return new Response('ok')
  }

  private handleGet(): Response {
    const job = this.getJob()
    if (!job) return new Response('Not found', { status: 404 })
    return Response.json(job)
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  private async runPipeline(job: Job): Promise<void> {
    try {
      this.updateJob({ status: 'converting_3d' })
      const workerUrl = this.env.WORKER_URL

      // Production tier: Meshy AI text-to-3D (PBR)
      if (job.tier === 'production' && this.env.MESHY_API_KEY) {
        const webhookUrl = workerUrl ? `${workerUrl}/webhook/meshy/${job.id}` : undefined
        const { taskId } = await textToModelWithMeshy(job.prompt, this.env.MESHY_API_KEY, webhookUrl)
        if (!webhookUrl) {
          const glbUrl = await pollMeshy(taskId, this.env.MESHY_API_KEY, 'text-to-3d')
          this.updateJob({ status: 'ready', glbUrl })
        }
        return
      }

      // Draft tier: Tripo AI text-to-model (~30s, no image needed)
      if (this.env.TRIPO_API_KEY) {
        const webhookUrl = workerUrl ? `${workerUrl}/webhook/tripo/${job.id}` : undefined
        const { taskId } = await textToModelWithTripo(job.prompt, this.env.TRIPO_API_KEY, webhookUrl)
        if (!webhookUrl) {
          const glbUrl = await pollTripo(taskId, this.env.TRIPO_API_KEY)
          this.updateJob({ status: 'ready', glbUrl })
        }
        return
      }

      // No 3D key — fall back to sample GLB so the studio stays functional
      this.updateJob({
        status: 'ready',
        glbUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb',
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown pipeline error'
      this.updateJob({ status: 'failed', error })
    }
  }

  // ── State helpers ────────────────────────────────────────────────────────

  private getJob(): Job | null {
    const rows = this.sql
      .exec('SELECT * FROM jobs LIMIT 1')
      .toArray()
    if (!rows.length) return null
    const r = rows[0] as Record<string, unknown>
    return {
      id: r.id as string,
      prompt: r.prompt as string,
      tier: r.tier as Job['tier'],
      status: r.status as Job['status'],
      provider2d: r.provider2d as string,
      provider3d: r.provider3d as string,
      imageUrl: r.image_url as string | undefined,
      glbUrl: r.glb_url as string | undefined,
      error: r.error as string | undefined,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }
  }

  private updateJob(patch: Partial<Job>): void {
    const sets: string[] = ['updated_at = ?']
    const vals: unknown[] = [Date.now()]

    if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status) }
    if (patch.imageUrl !== undefined) { sets.push('image_url = ?'); vals.push(patch.imageUrl) }
    if (patch.glbUrl !== undefined) { sets.push('glb_url = ?'); vals.push(patch.glbUrl) }
    if (patch.error !== undefined) { sets.push('error = ?'); vals.push(patch.error) }

    this.sql.exec(`UPDATE jobs SET ${sets.join(', ')}`, ...vals)

    const updated = this.getJob()
    if (updated) {
      const payload = JSON.stringify(updated)
      for (const listener of this.listeners) listener(payload)
    }
  }
}
