BEGIN;

CREATE TABLE IF NOT EXISTS tablemate_records (
  collection text NOT NULL,
  id text NOT NULL,
  value jsonb NOT NULL,
  due_ms bigint,
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS tablemate_due
  ON tablemate_records (collection, due_ms, id)
  WHERE due_ms IS NOT NULL;

CREATE TABLE IF NOT EXISTS tablemate_outbox (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS tablemate_outbox_retention ON tablemate_outbox (created_at);

COMMIT;
