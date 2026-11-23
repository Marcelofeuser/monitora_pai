BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS child_bio_locked boolean NOT NULL DEFAULT false;

COMMIT;
