import type { Env } from './types'
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
