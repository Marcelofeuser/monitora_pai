-- Aplicar com psql -X -v ON_ERROR_STOP=1 -f <arquivo>, primeiro em staging.
-- Aditiva: preserva QRs e credenciais existentes. Pode ser reaplicada.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE pairing_tokens
  ADD COLUMN IF NOT EXISTS pairing_code text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS pairing_tokens_pairing_code_unique
  ON pairing_tokens (pairing_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pairing_tokens'::regclass
      AND conname = 'pairing_tokens_attempt_count_nonnegative'
  ) THEN
    ALTER TABLE pairing_tokens
      ADD CONSTRAINT pairing_tokens_attempt_count_nonnegative CHECK (attempt_count >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pairing_rate_limits (
  id text PRIMARY KEY,
  source_hash text NOT NULL,
  window_started_at timestamp NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pairing_rate_limits_attempt_count_nonnegative CHECK (attempt_count >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS pairing_rate_limits_source_hash_unique
  ON pairing_rate_limits (source_hash);
CREATE INDEX IF NOT EXISTS pairing_rate_limits_blocked_until_idx
  ON pairing_rate_limits (blocked_until);

COMMIT;
