-- Controle persistente de tentativas do pareamento do Ampara Kids.
-- Preparação local: revisar e testar antes de qualquer execução em banco.
-- source_hash deve conter um hash criptográfico da origem normalizada.
-- Não armazenar IP ou outro identificador original nesta tabela.

CREATE TABLE pairing_rate_limits (
  id text PRIMARY KEY,
  source_hash text NOT NULL,
  window_started_at timestamp NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),

  CONSTRAINT pairing_rate_limits_attempt_count_nonnegative
    CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX pairing_rate_limits_source_hash_unique
  ON pairing_rate_limits (source_hash);

CREATE INDEX pairing_rate_limits_blocked_until_idx
  ON pairing_rate_limits (blocked_until);
