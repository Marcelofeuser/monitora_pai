-- Preparação do pareamento numérico do Ampara Kids.
-- NÃO EXECUTAR EM PRODUÇÃO ANTES DA REVISÃO E DOS TESTES.

ALTER TABLE pairing_tokens
  ADD COLUMN pairing_code text,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX pairing_tokens_pairing_code_unique
  ON pairing_tokens (pairing_code);
