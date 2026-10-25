# Checklist de publicação de cobrança no staging

Não executar em produção. O ambiente Stripe usado nesta primeira publicação é o modo de teste.

## Variáveis do `api-server` de staging

- `STRIPE_SECRET_KEY` com chave de teste (`sk_test_...` ou chave restrita de teste).
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`) do endpoint de staging.
- Os nove `STRIPE_PRICE_KIDS_*` de teste para Solo, Duo e Family nos períodos mensal, trimestral e anual.
- `SUPERADMIN_CLERK_USER_IDS` com o ID Clerk do administrador autorizado.
- `CLERK_AUTHORIZED_PARTIES` incluindo as origens HTTPS que usam este `api-server`.
- `APP_URL` apontando para a origem do PWA do mesmo ambiente; o checkout retorna para esse endereço.
- `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`, se as chamadas de voz/vídeo de staging precisarem de relay TURN. Sem elas, a API recorre apenas a STUN público e chamadas podem falhar em redes restritas.

Não registrar valores secretos em Git, logs ou mensagens.

**Estado conferido em 25/10/2026:** `STRIPE_SECRET_KEY` de teste, `STRIPE_WEBHOOK_SECRET` e os nove IDs de preço estão ativos no `api-server` de staging. A consulta pela CLI não mostra alterações ainda pendentes no painel; a captura do Railway confirma que `SUPERADMIN_CLERK_USER_IDS`, `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` estão adicionadas como três alterações pendentes no `api-server` de staging. Elas só entram em vigor quando forem aplicadas e o serviço for implantado. A configuração ativa do PWA de staging tem `VITE_CLERK_PUBLISHABLE_KEY` e `VITE_API_URL` apontando para a API de staging.

## Variáveis do `pwa` de staging

Confirme no serviço `pwa` (e não no `api-server`) as variáveis Vite usadas no build:

- `VITE_CLERK_PUBLISHABLE_KEY` com a chave pública do Clerk do ambiente de staging.
- `VITE_API_URL` apontando para a URL HTTPS da API de staging.
- `VITE_CLERK_PROXY_URL`, caso o proxy Clerk esteja habilitado nesse ambiente.

O Railway indicou `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` como ausente no serviço API. Este repositório usa Vite e lê `VITE_CLERK_PUBLISHABLE_KEY` no PWA; não copie a variável `NEXT_PUBLIC_*` para a API como substituto. Verifique o nome e o serviço de destino antes do deploy.

## Banco de dados de staging

**Estado em 25/10/2026:** as migrations `0004` e `0005` foram aplicadas ao Postgres de `staging` e verificadas por consulta. Não reaplicar nesse ambiente.

As migrations não são executadas automaticamente no deploy. Antes de publicar a API:

1. Confirme que está conectado ao banco do ambiente `staging`.
2. Confirme que `subscriptions.stripe_subscription_id`, a tabela `vouchers`, a tabela `ambassadors` e a tabela `ambassador_commissions` ainda não existem. As migrations não são idempotentes; não as reaplique se o schema já estiver presente.
3. Aplique `lib/db/migrations/0004_admin_billing_and_growth.sql` uma vez.
4. Aplique `lib/db/migrations/0005_subscription_guardians_limit.sql` uma vez.
5. Confirme que ambas terminaram com `COMMIT` e que `subscriptions.guardians_limit` existe.

Se não houver conexão de banco disponível pela Railway CLI, aplique os dois arquivos por um cliente SQL conectado explicitamente ao banco PostgreSQL de `staging`. Não cole `DATABASE_URL` ou credenciais aqui. Pare se o ambiente ou o schema existente não puderem ser confirmados.

As migrations usam transações. A migration 0005 mantém limite 4 para as linhas existentes e deixa limite 1 como padrão para novas assinaturas; o webhook grava o limite comprado no Stripe.

## Publicação e verificação

Depois de a branch conectada ao Railway conter as alterações e o banco de staging estar atualizado, publique `api-server`, `pwa` e `site-vendas` no ambiente `staging`. Não publique produção nesta etapa.

Valide em staging:

1. `/billing` abre depois do login e mostra os três planos e períodos corretos.
2. O checkout de teste cria uma sessão Stripe e retorna ao app após cancelar ou concluir.
3. O webhook Stripe entrega os quatro eventos configurados e a assinatura/limites aparecem atualizados no banco.
4. `/superadmin` permite acesso apenas ao ID listado em `SUPERADMIN_CLERK_USER_IDS`; crie um voucher e um embaixador de teste.
5. Confirme que os limites de crianças e responsáveis não removem acessos existentes.
