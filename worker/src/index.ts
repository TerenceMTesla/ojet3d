import type { Env, DeltaRecord } from './types'
import { insertDelta, listDeltas, getDeltaStats } from './deltaLog'
export { JobStore } from './JobStore'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function cors(res: Response): Response {
  const next = new Response(res.body, res)
  Object.entries(CORS).forEach(([k, v]) => next.headers.set(k, v))
  return next
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    const [, segment, ...rest] = url.pathname.split('/')
    // pathname examples:
    //   POST /generate
    //   GET  /status/:jobId
    //   GET  /job/:jobId
    //   POST /webhook/tripo/:jobId
    //   POST /webhook/meshy/:jobId

    try {
      if (segment === 'generate' && request.method === 'POST') {
        return cors(await handleGenerate(request, env))
      }

      if (segment === 'status' && rest[0]) {
        return cors(await forwardToJob(rest[0], 'status', 'GET', null, env))
      }

      if (segment === 'job' && rest[0]) {
        return cors(await forwardToJob(rest[0], 'get', 'GET', null, env))
      }

      // Delta logging routes
      //   POST /delta          — log one training triplet
      //   GET  /deltas         — list all triplets (JSON)
      //   GET  /deltas/export  — full dataset as NDJSON for training pipelines
      //   GET  /deltas/stats   — summary counts
      if (segment === 'delta' && request.method === 'POST') {
        return cors(await handleDeltaInsert(request, env))
      }
      if (segment === 'deltas') {
        if (rest[0] === 'export') return cors(await handleDeltaExport(env))
        if (rest[0] === 'stats')  return cors(await handleDeltaStats(env))
        return cors(await handleDeltaList(url, env))
      }

      if (segment === 'webhook' && rest[0] && rest[1]) {
        const provider = rest[0] // 'tripo' or 'meshy'
        const jobId = rest[1]
        return cors(
          await forwardToJob(jobId, `webhook_${provider}`, 'POST', request, env),
        )
      }

      return cors(new Response('Not found', { status: 404 }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal error'
      return cors(new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }))
    }
  },
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleGenerate(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { prompt?: string; tier?: string }
  if (!body.prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const jobId = crypto.randomUUID()
  const stub = getJobStub(jobId, env)

  const initUrl = new URL('https://do/')
  initUrl.searchParams.set('action', 'init')

  await stub.fetch(initUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: jobId, prompt: body.prompt, tier: body.tier ?? 'draft' }),
  })

  return Response.json({ jobId })
}

async function forwardToJob(
  jobId: string,
  action: string,
  method: string,
  originalRequest: Request | null,
  env: Env,
): Promise<Response> {
  const stub = getJobStub(jobId, env)
  const doUrl = new URL('https://do/')
  doUrl.searchParams.set('action', action)

  const init: RequestInit = { method }
  if (originalRequest && method === 'POST') {
    const body = await originalRequest.arrayBuffer()
    init.body = body
    init.headers = { 'Content-Type': originalRequest.headers.get('Content-Type') ?? 'application/json' }
  }

  return stub.fetch(doUrl.toString(), init)
}

function getJobStub(jobId: string, env: Env): DurableObjectStub {
  const id = env.JOBS.idFromName(jobId)
  return env.JOBS.get(id)
}

// ── Delta handlers ───────────────────────────────────────────────────────────

async function handleDeltaInsert(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Partial<DeltaRecord>
  if (!body.assetId || !body.prompt || !body.before || !body.after || !body.glbUrl) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const record: DeltaRecord = {
    id: crypto.randomUUID(),
    assetId: body.assetId,
    prompt: body.prompt,
    actionText: body.actionText,
    before: body.before,
    after: body.after,
    glbUrl: body.glbUrl,
    createdAt: Date.now(),
  }
  await insertDelta(env, record)
  return Response.json({ id: record.id })
}

async function handleDeltaList(url: URL, env: Env): Promise<Response> {
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '100'), 1000)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')
  const deltas = await listDeltas(env, limit, offset)
  return Response.json({ deltas, count: deltas.length })
}

async function handleDeltaExport(env: Env): Promise<Response> {
  // NDJSON stream — each line is one JSON training triplet
  const deltas = await listDeltas(env, 10_000, 0)
  const ndjson = deltas.map(d => JSON.stringify(d)).join('\n')
  return new Response(ndjson, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="ojet3d-deltas.ndjson"',
    },
  })
}

async function handleDeltaStats(env: Env): Promise<Response> {
  const stats = await getDeltaStats(env)
  return Response.json(stats)
}
