import type { Job, Env } from './types'
import { textToModelWithTripo, pollTripo } from './tripo'
import { textToModelWithMeshy, pollMeshy } from './meshy'
import { generateImage } from './prodia'
import { searchAndFetchGLB, downloadCandidateGLB } from './sketchfab'

const SAMPLE_GLB =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb'

/**
 * JobStore — one Durable Object instance per job (keyed by jobId).
 *
 * Responsibilities:
 *   1. Persist job state in SQLite across requests/restarts
 *   2. Run the full 2D→3D pipeline (survives tab close)
 *   3. Accept webhook callbacks from Tripo
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
        variant_index INTEGER NOT NULL DEFAULT 0,
        variant_count INTEGER NOT NULL DEFAULT 1,
        variant_name TEXT,
        variant_author TEXT,
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
    if (action === 'get' && request.method === 'GET') {
      return this.handleGet()
    }
    if (action === 'asset' && request.method === 'GET') {
      return this.handleAsset()
    }
    if (action === 'variant' && request.method === 'POST') {
      return this.handleVariantSwap()
    }

    return new Response('Not found', { status: 404 })
  }

  // Cycle to the next Sketchfab candidate from the original search.
  // Downloads its GLB, replaces the KV entry, bumps variantIndex so the
  // frontend cache-busts via the ?v= query param.
  private async handleVariantSwap(): Promise<Response> {
    const job = this.getJob()
    if (!job) return new Response('Job not found', { status: 404 })
    if (!this.env.SKETCHFAB_API_KEY) {
      return new Response('Sketchfab key not configured', { status: 400 })
    }

    const candidates = await this.state.storage.get<
      Array<{ uid: string; name: string; author: string }>
    >('candidates')
    if (!candidates || candidates.length < 2) {
      return Response.json({ ok: false, reason: 'no alternates' })
    }

    // Find the next candidate that successfully downloads a GLB. Walk forward
    // from the current index, wrapping around, so we don't get stuck on bad
    // entries permanently.
    const start = (job.variantIndex + 1) % candidates.length
    let nextIndex = -1
    let bytes: Uint8Array | null = null
    let next: typeof candidates[number] | null = null

    for (let step = 0; step < candidates.length; step++) {
      const i = (start + step) % candidates.length
      if (i === job.variantIndex) continue
      const c = candidates[i]
      const b = await downloadCandidateGLB(c.uid, this.env.SKETCHFAB_API_KEY)
      if (b) { nextIndex = i; bytes = b; next = c; break }
    }

    if (!bytes || nextIndex < 0 || !next) {
      return Response.json({ ok: false, reason: 'no usable variant' })
    }

    await this.env.ASSETS.put(`glb:${job.id}`, bytes, {
      expirationTtl: 60 * 60 * 24 * 7,
    })

    const workerUrl = this.env.WORKER_URL
    const glbUrl = workerUrl
      ? `${workerUrl}/asset/${job.id}.glb?v=${nextIndex}`
      : job.glbUrl
    this.updateJob({
      glbUrl,
      variantIndex: nextIndex,
      variantName: next.name,
      variantAuthor: next.author,
    })

    return Response.json({ ok: true, variantIndex: nextIndex, name: next.name })
  }

  // Serve cached GLB bytes from KV
  private async handleAsset(): Promise<Response> {
    const job = this.getJob()
    if (!job) return new Response('Job not found', { status: 404 })
    const bytes = await this.env.ASSETS.get(`glb:${job.id}`, 'arrayBuffer')
    if (!bytes) return new Response('Asset not found', { status: 404 })
    return new Response(bytes, {
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // ── Init: create job row + kick off pipeline in background ──────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { id: string; prompt: string; tier: string }
    const now = Date.now()
    const hasSketchfab = !!this.env.SKETCHFAB_API_KEY
    const hasTripo = !!this.env.TRIPO_API_KEY

    const job: Job = {
      id: body.id,
      prompt: body.prompt,
      tier: body.tier as Job['tier'],
      status: 'queued',
      provider2d: hasSketchfab ? 'Sketchfab search' : 'fallback',
      provider3d: hasSketchfab
        ? 'Sketchfab CC library'
        : hasTripo ? 'Tripo AI' : 'demo',
      variantIndex: 0,
      variantCount: 1,
      createdAt: now,
      updatedAt: now,
    }

    this.sql.exec(
      `INSERT INTO jobs (id, prompt, tier, status, provider2d, provider3d, variant_index, variant_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      job.id, job.prompt, job.tier, job.status,
      job.provider2d, job.provider3d,
      job.variantIndex, job.variantCount,
      job.createdAt, job.updatedAt,
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
    let closed = false

    const send = (data: string) => {
      if (closed) return
      writer.write(encoder.encode(`data: ${data}\n\n`)).catch(() => {
        closed = true
        this.listeners.delete(send)
      })
    }

    // Immediately replay current state
    const current = this.getJob()
    if (current) send(JSON.stringify(current))

    // Register for future job updates
    this.listeners.add(send)

    // If job is already terminal, close the stream after the initial payload
    if (current?.status === 'ready' || current?.status === 'failed') {
      writer.close().catch(() => {})
      closed = true
      this.listeners.delete(send)
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
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

  private handleGet(): Response {
    const job = this.getJob()
    if (!job) return new Response('Not found', { status: 404 })
    return Response.json(job)
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  private async runPipeline(job: Job): Promise<void> {
    try {
      if (job.tier === 'production') {
        await this.runProductionPipeline(job)
      } else {
        await this.runDraftPipeline(job)
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown pipeline error'
      this.updateJob({ status: 'failed', error })
    }
  }

  // Draft: Sketchfab (free, fast) → Tripo text-to-3D → sample GLB
  private async runDraftPipeline(job: Job): Promise<void> {
    const workerUrl = this.env.WORKER_URL

    if (this.env.SKETCHFAB_API_KEY) {
      this.updateJob({ status: 'converting_3d' })
      const found = await searchAndFetchGLB(job.prompt, this.env.SKETCHFAB_API_KEY)
      if (found) {
        await this.env.ASSETS.put(`glb:${job.id}`, found.bytes, {
          expirationTtl: 60 * 60 * 24 * 7,
        })
        const candidateUids = found.candidates.map(c => ({
          uid: c.uid,
          name: c.name,
          author: c.user.username,
        }))
        await this.state.storage.put('candidates', candidateUids)
        const glbUrl = workerUrl ? `${workerUrl}/asset/${job.id}.glb?v=0` : SAMPLE_GLB
        this.updateJob({
          status: 'ready',
          glbUrl,
          variantIndex: found.pickedIndex,
          variantCount: candidateUids.length,
          variantName: found.modelName,
          variantAuthor: found.author,
        })
        return
      }
    }

    if (this.env.TRIPO_API_KEY) {
      try {
        this.updateJob({ status: 'converting_3d' })
        const webhookUrl = workerUrl ? `${workerUrl}/webhook/tripo/${job.id}` : undefined
        const { taskId } = await textToModelWithTripo(job.prompt, this.env.TRIPO_API_KEY, webhookUrl)
        if (!webhookUrl) {
          const glbUrl = await pollTripo(taskId, this.env.TRIPO_API_KEY)
          this.updateJob({ status: 'ready', glbUrl })
        }
        return
      } catch (err) {
        console.warn('[Draft] Tripo unavailable:', err)
      }
    }

    this.updateJob({ status: 'ready', glbUrl: SAMPLE_GLB })
  }

  // Production: Prodia 2D seed → Meshy image-to-3D (PBR) → Tripo text-to-3D → sample GLB
  private async runProductionPipeline(job: Job): Promise<void> {
    const workerUrl = this.env.WORKER_URL

    // Step 1: generate orthographic 2D concept image
    let imageUrl: string | undefined
    if (this.env.PRODIA_API_KEY) {
      try {
        this.updateJob({ status: 'generating_image' })
        imageUrl = await generateImage(job.prompt, this.env.PRODIA_API_KEY)
        this.updateJob({ imageUrl })
      } catch (err) {
        console.warn('[Production] Prodia unavailable, skipping 2D step:', err)
      }
    }

    // Step 2: Meshy image-to-3D (if we have an image) or text-to-3D
    if (this.env.MESHY_API_KEY) {
      try {
        this.updateJob({ status: 'converting_3d' })
        const { taskId } = await textToModelWithMeshy(job.prompt, this.env.MESHY_API_KEY)
        const glbUrl = await pollMeshy(taskId, this.env.MESHY_API_KEY)
        this.updateJob({ status: 'ready', glbUrl, imageUrl })
        return
      } catch (err) {
        console.warn('[Production] Meshy unavailable, falling back to Tripo:', err)
      }
    }

    // Step 3: Tripo fallback
    if (this.env.TRIPO_API_KEY) {
      try {
        this.updateJob({ status: 'converting_3d' })
        const webhookUrl = workerUrl ? `${workerUrl}/webhook/tripo/${job.id}` : undefined
        const { taskId } = await textToModelWithTripo(job.prompt, this.env.TRIPO_API_KEY, webhookUrl)
        if (!webhookUrl) {
          const glbUrl = await pollTripo(taskId, this.env.TRIPO_API_KEY)
          this.updateJob({ status: 'ready', glbUrl, imageUrl })
        }
        return
      } catch (err) {
        console.warn('[Production] Tripo unavailable:', err)
      }
    }

    this.updateJob({ status: 'ready', glbUrl: SAMPLE_GLB })
  }

  // ── State helpers ────────────────────────────────────────────────────────

  private getJob(): Job | null {
    const rows = this.sql.exec('SELECT * FROM jobs LIMIT 1').toArray()
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
      variantIndex: (r.variant_index as number) ?? 0,
      variantCount: (r.variant_count as number) ?? 1,
      variantName: r.variant_name as string | undefined,
      variantAuthor: r.variant_author as string | undefined,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }
  }

  private updateJob(patch: Partial<Job>): void {
    const sets: string[] = ['updated_at = ?']
    const vals: unknown[] = [Date.now()]

    if (patch.status !== undefined)        { sets.push('status = ?');         vals.push(patch.status) }
    if (patch.imageUrl !== undefined)      { sets.push('image_url = ?');      vals.push(patch.imageUrl) }
    if (patch.glbUrl !== undefined)        { sets.push('glb_url = ?');        vals.push(patch.glbUrl) }
    if (patch.error !== undefined)         { sets.push('error = ?');          vals.push(patch.error) }
    if (patch.variantIndex !== undefined)  { sets.push('variant_index = ?');  vals.push(patch.variantIndex) }
    if (patch.variantCount !== undefined)  { sets.push('variant_count = ?');  vals.push(patch.variantCount) }
    if (patch.variantName !== undefined)   { sets.push('variant_name = ?');   vals.push(patch.variantName) }
    if (patch.variantAuthor !== undefined) { sets.push('variant_author = ?'); vals.push(patch.variantAuthor) }

    this.sql.exec(`UPDATE jobs SET ${sets.join(', ')}`, ...vals)

    const updated = this.getJob()
    if (updated) {
      const payload = JSON.stringify(updated)
      for (const listener of this.listeners) listener(payload)
    }
  }
}
