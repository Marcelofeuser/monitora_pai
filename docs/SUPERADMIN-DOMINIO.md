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

## Estado depois do merge do PR #6

O portal e o proxy estão no `main` desde o PR #6. O deploy de `site-vendas` está ativo e `https://amparakids.com/superadmin` respondeu HTTP 200. As migrations `0001` a `0005` foram verificadas no Postgres de produção, e `SUPERADMIN_CLERK_USER_IDS` está configurada. A release ainda depende de a API e o PWA terminarem seus deployments e da validação autenticada do portal.

O estado completo dos serviços e dos apps está em [AMPARA-KIDS-MAPA-ESTRUTURAL.md](./AMPARA-KIDS-MAPA-ESTRUTURAL.md).
