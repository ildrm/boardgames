BEGIN;

ALTER TABLE tablemate_outbox
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS tablemate_outbox_pending
  ON tablemate_outbox (event_id) WHERE published_at IS NULL;

COMMIT;
