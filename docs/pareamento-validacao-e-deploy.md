# Pareamento: validação e publicação

Base: snapshot do commit `902fbc1`. Não publicar antes de concluir as etapas abaixo.
O checklist separado mencionado na conversa não estava presente nos anexos:
esta sequência deriva do resumo fornecido e não substitui um documento ausente.

## Contrato desta alteração

- O QR de instalação é independente do pareamento e deverá apontar para uma
  página que encaminhe à loja correta. Os links oficiais das lojas ainda não
  foram publicados/configurados; o app nativo não deve apresentar um QR de
  pareamento como se fosse o QR de download.
- Mantém QR com token aleatório de 192 bits, validade de 15 minutos e uso único.
- Os apps nativos usam código numérico aleatório de 8 dígitos, válido por
  15 minutos e de uso único. O endpoint ainda aceita tokens longos para manter
  compatibilidade com a PWA já publicada. A coluna `pairing_code` tem índice
  único. O contador efetivo por origem fica em `pairing_rate_limits`.
- Confirmar token legado: até 30 tentativas por origem; confirmar código
  numérico: até 5 tentativas por origem, em janela fixa de 15 minutos.
  Inclui corpos JSON válidos com conteúdo inválido, QRs inválidos e sucessos.
- Gerar/reconectar: até 20 tentativas somadas por responsável em 15 minutos,
  incluindo erros de validação e de autorização de criança após autenticação.
- Acima do limite: HTTP 429 com `Retry-After` em segundos. Falha no banco não
  libera a confirmação. A janela usa o relógio do PostgreSQL em UTC.
- Origem armazenada como HMAC-SHA256 com segredo dedicado, sem IP/Clerk ID bruto.
- Reconectar revoga credenciais ativas anteriores e cria a nova na mesma
  transação. Bloqueia também a linha da criança: QRs diferentes são serializados.
  Em duas reconexões válidas concorrentes, a última confirmação mantém a
  credencial ativa. O perfil e o histórico da criança são preservados.
- O vínculo do responsável adicional é revalidado no consumo do QR.
  Falha na inserção reverte revogação e consumo; sockets só são desconectados
  após commit. Não inventa um novo consentimento ao reconectar.

## 1. Revisão e validação local

- [ ] Conferir o diff e preservar alterações locais. Aplicar patch com `git apply --check` antes de `git apply`.
- [ ] Usar pnpm 9.15.9 e o lockfile existente; não atualizar dependências nesta correção.
- [ ] `pnpm install --frozen-lockfile`.
- [ ] `pnpm run typecheck`.
- [ ] `pnpm --filter @workspace/api-server test`.
- [ ] Executar os testes reais de PostgreSQL em banco descartável cujo nome
  termine em `_test`, configurando apenas `PAIRING_TEST_DATABASE_URL`.
  Sem essa variável, a suíte PostgreSQL fica explicitamente ignorada.
  Os testes criam/removem um schema aleatório e não usam a `DATABASE_URL`
  da aplicação como alternativa. Nunca apontar para produção.
- [ ] `pnpm --filter @workspace/api-server run build`.
- [ ] `pnpm --filter @workspace/controle-parental run typecheck`.
- [ ] Gerar builds nativos de desenvolvimento e testar o fluxo em aparelhos
  Android e iOS, incluindo expiração, código usado e limite de tentativas.
- [ ] `pnpm --filter @workspace/controle-parental-pwa run build`.
- [ ] `git diff --check`.

O workflow de PR/main agora provisiona PostgreSQL 16 e exige essa suíte, além
de typecheck, testes existentes e builds. O resultado real de CI deve ser
conferido; a simples inclusão do workflow não comprova execução.

## 2. Staging

- [ ] Confirmar ambiente e banco de staging antes de executar SQL.
- [ ] Conferir que a migration `0001` (`revoked_at`) já foi aplicada nesse banco.
- [ ] Aplicar `0002_pairing_schema_and_rate_limits.sql` usando
  `psql -X -v ON_ERROR_STOP=1 -f ...` e conexão explícita com staging.
  O arquivo contém BEGIN/COMMIT e limites de espera. Se falhar, não continuar.
  `IF NOT EXISTS` tolera reaplicação da mesma estrutura; não corrige uma
  estrutura preexistente incompatível. Conferir tabelas e índices após aplicar.
- [ ] Configurar `PAIRING_RATE_LIMIT_SECRET` com pelo menos 32 caracteres
  aleatórios, persistente e igual em todas as réplicas do mesmo ambiente.
  Gerar localmente com `openssl rand -hex 32`. Nunca colar o valor em logs/chat.
  Sem segredo válido em NODE_ENV=production, a API recusa inicializar.
- [ ] Verificar a topologia real do proxy. Configurar `TRUSTED_PROXY_CIDRS`
  somente com IPs/CIDRs de proxies que sanitizam o cabeçalho encaminhado.
  Sem configuração, Express ignora X-Forwarded-For e limita pelo IP da conexão
  (clientes atrás do mesmo proxy podem compartilhar a cota). Não usar `true`,
  confiar em redes inteiras sem verificar, nem aceitar X-Forwarded-For diretamente.
- [ ] Publicar o commit revisado apenas em staging; conferir o SHA implantado.
- [ ] Smoke: criar QR, confirmar, verificar autenticação e perfil existente.
- [ ] Smoke: reconectar, verificar token antigo recusado em HTTP e Socket.IO,
  token novo aceito e histórico preservado.
- [ ] Smoke: revogar dispositivo manualmente e conferir bloqueio.
- [ ] Smoke: exceder cota com origem de teste controlada e conferir 429,
  mensagem na PWA e Retry-After. Conferir separação entre origens/responsáveis.
- [ ] Conferir que IP de origem não pode ser trocado por header arbitrário.
- [ ] Conferir logs/erros sem divulgar tokens, segredo ou dados pessoais.

## 3. Produção

- [ ] Confirmar aprovação de CI e smoke tests de staging.
- [ ] Conferir backup/recuperação do banco e versão anterior da API.
- [ ] Aplicar migrations aditivas pendentes e configurar segredo/proxy no
  ambiente de produção antes do deploy da API correspondente.
- [ ] Publicar API e PWA revisadas, conferir SHA e repetir smoke tests
  com contas/dispositivos de teste autorizados.
- [ ] Verificar erros, 429 inesperados e saúde do serviço.

Rollback: voltar o deploy da API/PWA para a versão anterior compatível.
Preservar colunas e tabela aditivas; não apagar dados nem remover migrations
como parte de um rollback de aplicação. Credenciais já revogadas permanecem
revogadas; reconectar novamente quando necessário.

## Operação e limites

Pode-se remover contadores sem atividade há mais de 24 horas em rotina
operacional autorizada: `DELETE FROM pairing_rate_limits WHERE updated_at <
(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - interval '24 hours'`. O bloqueio dura
15 minutos; essa retenção não apaga janelas ativas. Rotacionar o segredo troca
os identificadores e reinicia efetivamente as cotas existentes.

O limiter é compartilhado pelo PostgreSQL. A desconexão imediata de sockets
continua local à réplica, conforme arquitetura atual do signaling (uma réplica).
Não escalar signaling sem adapter compartilhado e propagação de revogação.
Autenticação HTTP/novos handshakes consulta `revoked_at`; requests já em
andamento não são cancelados retroativamente.

O limiter não substitui limites de tráfego/JSON inválido na borda: JSON
malformado é recusado pelo parser antes da rota.
