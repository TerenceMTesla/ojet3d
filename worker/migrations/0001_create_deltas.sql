-- Delta log: each row is one training triplet for the self-reflecting engine.
-- (input_glb_url, action_vector, output_transforms) pairs accumulate over time
-- and will be used to fine-tune a LoRA model on user aesthetic preferences.

CREATE TABLE IF NOT EXISTS deltas (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL,
  prompt      TEXT NOT NULL,          -- original generation prompt (context)
  action_text TEXT,                   -- freeform chat command that caused the edit, if any
  -- Transform state BEFORE the edit
  twist_before    REAL NOT NULL DEFAULT 0,
  taper_before    REAL NOT NULL DEFAULT 0,
  bend_before     REAL NOT NULL DEFAULT 0,
  smooth_before   REAL NOT NULL DEFAULT 0,
  scale_x_before  REAL NOT NULL DEFAULT 1,
  scale_y_before  REAL NOT NULL DEFAULT 1,
  scale_z_before  REAL NOT NULL DEFAULT 1,
  -- Transform state AFTER the edit
  twist_after     REAL NOT NULL DEFAULT 0,
  taper_after     REAL NOT NULL DEFAULT 0,
  bend_after      REAL NOT NULL DEFAULT 0,
  smooth_after    REAL NOT NULL DEFAULT 0,
  scale_x_after   REAL NOT NULL DEFAULT 1,
  scale_y_after   REAL NOT NULL DEFAULT 1,
  scale_z_after   REAL NOT NULL DEFAULT 1,
  -- Asset reference
  glb_url     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deltas_asset   ON deltas (asset_id);
CREATE INDEX IF NOT EXISTS idx_deltas_created ON deltas (created_at DESC);
