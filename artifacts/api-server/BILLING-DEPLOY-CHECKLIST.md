# Configuração de cobrança — staging e produção

Este documento separa Stripe de teste de Stripe live. Nunca use IDs ou segredos de teste para cobrar clientes reais.

## Variáveis do `api-server` de staging

- `STRIPE_SECRET_KEY` com chave de teste (`sk_test_...` ou chave restrita de teste).
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`) do endpoint de staging.
- Os nove `STRIPE_PRICE_KIDS_*` de teste para Solo, Duo e Family nos períodos mensal, trimestral e anual.
- `SUPERADMIN_CLERK_USER_IDS` com o ID Clerk do administrador autorizado.
- `CLERK_AUTHORIZED_PARTIES` incluindo as origens HTTPS que usam este `api-server`.
- `APP_URL` apontando para a origem do PWA do mesmo ambiente; o checkout retorna para esse endereço.
- `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`, se as chamadas de voz/vídeo de staging precisarem de relay TURN. Sem elas, a API recorre apenas a STUN público e chamadas podem falhar em redes restritas.

Não registrar valores secretos em Git, logs ou mensagens.

**Estado conferido em 25/10/2026:** `STRIPE_SECRET_KEY` de teste, `STRIPE_WEBHOOK_SECRET`, os nove IDs de preço, `SUPERADMIN_CLERK_USER_IDS`, `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` estão ativos no `api-server` de staging. O PWA de staging tem `VITE_CLERK_PUBLISHABLE_KEY` e `VITE_API_URL` apontando para a API de staging.

## Variáveis do `pwa` de staging

Confirme no serviço `pwa` (e não no `api-server`) as variáveis Vite usadas no build:

- `VITE_CLERK_PUBLISHABLE_KEY` com a chave pública do Clerk do ambiente de staging.
- `VITE_API_URL` apontando para a URL HTTPS da API de staging.
- `VITE_CLERK_PROXY_URL`, caso o proxy Clerk esteja habilitado nesse ambiente.

O Railway indicou `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` como ausente no serviço API. Este repositório usa Vite e lê `VITE_CLERK_PUBLISHABLE_KEY` no PWA; não copie a variável `NEXT_PUBLIC_*` para a API como substituto. Verifique o nome e o serviço de destino antes do deploy.

## Banco de dados

**Estado verificado em 25/10/2026:** as migrations `0001` a `0005` estão presentes no Postgres de produção. `0002`, `0004` e `0005` foram aplicadas após uma inspeção somente de leitura confirmar que estavam ausentes; tabelas e colunas foram conferidas depois. `0004` e `0005` também já estavam aplicadas em staging.

As migrations não rodam automaticamente no deploy. Em futuras alterações, confirme o ambiente e o schema antes de executar SQL. Não apague colunas/tabelas como rollback. A migration 0005 preserva valores existentes, usa limite 1 por padrão para novas assinaturas, e o webhook grava o limite comprado no Stripe.

## Estado de produção e próximos passos

O PR #6 foi mesclado em `main` no commit `6f0573b` em 25/10/2026. `site-vendas` e `landing page apps` publicaram com sucesso. O primeiro deploy da API falhou por falta de `PAIRING_RATE_LIMIT_SECRET`; um segredo aleatório foi adicionado sem expor seu valor e um novo deploy começou. O primeiro build do PWA falhou por uma variável vazia com nome inválido; a entrada foi removida e um novo build foi solicitado. Confira os estados finais no Railway antes de considerar a release operacional.

Stripe de produção ainda não pode cobrar. Faltam configurar no `api-server` de produção uma `STRIPE_SECRET_KEY` live, o `STRIPE_WEBHOOK_SECRET` do endpoint live e os nove `STRIPE_PRICE_KIDS_*` live (três planos × três períodos). Não reutilize os valores de teste.

Depois que API e PWA estiverem estáveis, validar login, `/billing`, Checkout e webhook de teste no staging; em produção, usar apenas chaves e preços live. Validar também `/superadmin`, vouchers e embaixadores com o usuário autorizado.
