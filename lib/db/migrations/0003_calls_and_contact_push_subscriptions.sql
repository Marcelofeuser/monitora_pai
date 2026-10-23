-- Completa o schema que o api-server atual usa para chamadas e push.
-- A tabela push_subscriptions já existia em staging, mas sem contact_user_id.
-- calls e seus enums ainda não existiam, então as ligações falhavam ao iniciar.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
  CREATE TYPE call_status AS ENUM ('ringing', 'active', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE call_end_reason AS ENUM (
    'hangup', 'declined', 'missed', 'busy', 'canceled', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS contact_user_id text
  REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status call_status NOT NULL DEFAULT 'ringing',
  created_at timestamp NOT NULL DEFAULT now(),
  answered_at timestamp,
  ended_at timestamp,
  end_reason call_end_reason
);

COMMIT;
