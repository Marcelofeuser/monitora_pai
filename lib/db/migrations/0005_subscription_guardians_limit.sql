BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS guardians_limit integer NOT NULL DEFAULT 4;

-- Existing paid families may already have several guardians. Preserve access
-- for those rows, while new subscriptions start at the Kids Solo limit.
ALTER TABLE subscriptions
  ALTER COLUMN guardians_limit SET DEFAULT 1;

COMMIT;
