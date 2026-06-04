import type { Env, DeltaRecord, TransformSnapshot } from './types'

export async function insertDelta(env: Env, delta: DeltaRecord): Promise<void> {
  const b = delta.before
  const a = delta.after
  await env.DB.prepare(`
    INSERT INTO deltas (
      id, asset_id, prompt, action_text,
      twist_before, taper_before, bend_before, smooth_before,
      scale_x_before, scale_y_before, scale_z_before,
      twist_after, taper_after, bend_after, smooth_after,
      scale_x_after, scale_y_after, scale_z_after,
      glb_url, created_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )
  `).bind(
    delta.id, delta.assetId, delta.prompt, delta.actionText ?? null,
    b.twist, b.taper, b.bend, b.smooth,
    b.scaleX, b.scaleY, b.scaleZ,
    a.twist, a.taper, a.bend, a.smooth,
    a.scaleX, a.scaleY, a.scaleZ,
    delta.glbUrl, delta.createdAt,
  ).run()
}

export async function listDeltas(
  env: Env,
  limit = 500,
  offset = 0,
): Promise<DeltaRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM deltas ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).bind(limit, offset).all()

  return results.map(rowToRecord)
}

export async function getDeltaStats(env: Env): Promise<{
  total: number
  assets: number
  earliest: number | null
  latest: number | null
}> {
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*)           AS total,
      COUNT(DISTINCT asset_id) AS assets,
      MIN(created_at)    AS earliest,
      MAX(created_at)    AS latest
    FROM deltas
  `).first() as Record<string, number> | null

  return {
    total: row?.total ?? 0,
    assets: row?.assets ?? 0,
    earliest: row?.earliest ?? null,
    latest: row?.latest ?? null,
  }
}

function rowToRecord(r: Record<string, unknown>): DeltaRecord {
  return {
    id: r.id as string,
    assetId: r.asset_id as string,
    prompt: r.prompt as string,
    actionText: r.action_text as string | undefined,
    before: {
      twist: r.twist_before as number,
      taper: r.taper_before as number,
      bend: r.bend_before as number,
      smooth: r.smooth_before as number,
      scaleX: r.scale_x_before as number,
      scaleY: r.scale_y_before as number,
      scaleZ: r.scale_z_before as number,
    },
    after: {
      twist: r.twist_after as number,
      taper: r.taper_after as number,
      bend: r.bend_after as number,
      smooth: r.smooth_after as number,
      scaleX: r.scale_x_after as number,
      scaleY: r.scale_y_after as number,
      scaleZ: r.scale_z_after as number,
    },
    glbUrl: r.glb_url as string,
    createdAt: r.created_at as number,
  }
}
