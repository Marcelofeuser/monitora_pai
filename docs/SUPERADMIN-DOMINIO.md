# Superadmin no domínio Ampara

O endereço público esperado para o portal é `https://amparakids.com/superadmin`. O serviço `site-vendas`, que recebe o domínio raiz, encaminha as rotas do app para o PWA sem redirecionar o navegador para Railway ou para o subdomínio do app.

## Configuração por ambiente

No serviço `site-vendas`, configure `PWA_UPSTREAM_ORIGIN` com a origem do PWA do mesmo ambiente:

- Staging: `https://pwa-staging-fe26.up.railway.app`
- Produção: `https://responsavel.amparakids.com`

O código usa esses mesmos destinos como padrão quando a variável não existe, mas configurá-la explicitamente evita encaminhar tráfego ao ambiente errado.

No `api-server` de produção:

- `SUPERADMIN_CLERK_USER_IDS` deve conter o ID Clerk da conta autorizada.
- `CLERK_AUTHORIZED_PARTIES` deve incluir `https://amparakids.com` e `https://responsavel.amparakids.com`, além das demais origens de produção necessárias.
- `VITE_API_URL` no PWA de produção deve continuar apontando para a API de produção.

O domínio raiz `amparakids.com` precisa continuar associado ao `site-vendas`. As rotas `/assets`, `/sign-in`, `/sign-up` e as rotas internas do app também passam pelo proxy, para os recursos, autenticação e links do painel funcionarem no mesmo domínio.

## Publicação

Antes de liberar a funcionalidade em produção, conferir a publicação de `site-vendas` e `pwa`, a allowlist Clerk, o usuário superadmin e as migrations/variáveis do `api-server`. O código do portal e as migrations de cobrança ainda precisam ser incluídos na release de produção; não basta publicar somente o redirecionamento da landing page.
