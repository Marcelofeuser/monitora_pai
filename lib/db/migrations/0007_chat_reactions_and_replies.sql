-- 1.1 do chat: reações com emoji e "responder" uma mensagem específica.
-- Só adiciona (tabela nova + colunas anuláveis). Não altera nem apaga dados existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Responder: aponta para a mensagem citada. Se a original for apagada, a resposta fica sem citação.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
  REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
  REFERENCES group_messages(id) ON DELETE SET NULL;

-- Reações: uma por pessoa por mensagem (trocar o emoji substitui, igual ao WhatsApp).
-- Serve tanto para conversa individual (message_id) quanto para grupo (group_message_id).
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  group_message_id uuid REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_one_target CHECK (
    (message_id IS NOT NULL AND group_message_id IS NULL)
    OR (message_id IS NULL AND group_message_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_message_user_uq
  ON message_reactions (message_id, user_id) WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_group_message_user_uq
  ON message_reactions (group_message_id, user_id) WHERE group_message_id IS NOT NULL;

COMMIT;
