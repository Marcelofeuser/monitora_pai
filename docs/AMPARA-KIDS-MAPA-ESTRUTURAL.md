# Ampara Kids — mapa estrutural

Levantamento feito lendo o código deste repositório e consultando o estado do Railway em 25/10/2026. Contagens descrevem declarações encontradas no código; não significam que todas as funções estejam publicadas ou validadas em aparelhos reais.

## 1. Visão geral — dois apps nativos, app web e um backend

```text
┌──────────────────────┐  ┌──────────────────────┐
│ Ampara Responsáveis  │  │ Ampara Criança       │
│ React Native + Expo  │  │ React Native + Expo  │
│ appRole=parent       │  │ appRole=child        │
└──────────┬───────────┘  └──────────┬───────────┘
           └──────────────┬──────────┘
                          ▼
             ┌───────────────────────────┐
             │ API única · Express/TS    │
             │ pairing, chat, chamadas,  │
             │ localização, billing, etc.│
             └─────────────┬─────────────┘
                           ▼
             ┌───────────────────────────┐
             │ PostgreSQL + Drizzle ORM  │
             └───────────────────────────┘

  PWA (Vite) ───────┘       site-vendas (Express)
  responsável.amparakids.com  amparakids.com
  crianca.amparakids.com      /superadmin faz proxy para o PWA

  baixar.amparakids.com → landing page/roteamento para os apps
```

O repositório `Marcelofeuser/monitora_pai` é um monorepo pnpm. O código nativo principal fica em `artifacts/controle-parental`; um único projeto Expo seleciona dois produtos pelo `AMPARA_APP` (`responsavel` ou `crianca`). API, PWA, site de vendas, landing page de downloads e bibliotecas compartilhadas vivem no mesmo repositório. O Railway mantém ambientes separados de staging e produção. Também existem dois projetos Android legados em `artifacts/android-responsavel` e `artifacts/android-crianca`; os READMEs os descrevem como Trusted Web Activities que abrem o PWA. Eles não são o caminho nativo Android/iOS atual.

## 2. Serviços e domínios

| Serviço | Responsabilidade | Endereço / estado observado |
|---|---|---|
| `api-server` | API HTTP, Clerk, WebSocket/sinalização e integração com serviços externos | Domínio Railway de produção; deploy `SUCCESS` no commit `6f0573b`; `/api/healthz` HTTP 200 |
| `pwa` | Interface web para Responsável e Criança | `responsavel.amparakids.com` e `crianca.amparakids.com`; deploy `SUCCESS` no commit `6f0573b` |
| `site-vendas` | Site institucional e proxy para o PWA em `/superadmin` | `amparakids.com`; deploy `SUCCESS` no commit `6f0573b` |
| `landing page apps` | Download: QR abre app Criança por padrão; rota `/responsavel` abre o app de responsáveis; detecção de iOS/Android encaminha à loja configurada | `baixar.amparakids.com`; correção do APK antigo está no PR #10 |
| `postgres` | Banco PostgreSQL persistente | Em produção, volume `postgres-data`; serviço `SUCCESS` |
| `media-storage` | Arquivos enviados, montados no serviço da API | Volume Railway associado à API |

Staging: `pwa-staging-fe26.up.railway.app`, `api-server-staging-fc25.up.railway.app` e `site-vendas-staging.up.railway.app`. Os três serviços e o Postgres de staging estavam `SUCCESS` no commit `e96438d` quando consultados. `amparakids.com/superadmin` respondeu HTTP 200 após o deploy do site; isso confirma a rota do proxy, mas não substitui a validação de sessão, painel e API.

## 3. Backend — API Express/TypeScript

Entrada: `artifacts/api-server/src/app.ts`; rotas agregadas em `artifacts/api-server/src/routes/index.ts`. Há 15 módulos de domínio montados pelo roteador principal e 97 declarações de rota (`get/post/patch/delete`) nos módulos de rotas; a rota de health é montada à parte.

| Módulo | Função principal |
|---|---|
| `pairing` | Pareamento inicial, confirmação e reconexão por código de 8 dígitos, com limite de tentativas |
| `contacts` | Crianças/contatos, pedidos, aprovação, recusa, bloqueio e revogação |
| `conversations` / `messages` | Chat privado familiar, conversa com contatos e espelho de conversas aprovadas |
| `groups` | Grupos e mensagens para Responsável, Criança e Contato |
| `guardians` | Convites e gestão de responsáveis adicionais |
| `location` | Compartilhamento de localização iniciado pela Criança e leitura pelo responsável |
| `screenTime` | Limite diário, bloqueio/desbloqueio e heartbeat do app infantil |
| `calls` + `signaling` | Sinalização de voz/vídeo, estado persistido da chamada e credenciais TURN temporárias |
| `devices` | Dispositivos infantis vinculados e revogação de sessão/dispositivo |
| `media` / perfis | Upload e leitura de mídia, fotos de perfil e grupo |
| `notifications` | Web Push e token FCM para apps nativos |
| `billing` | Checkout Stripe, webhook, assinatura e comissão de indicação |
| `admin` | Visão geral, usuários/assinaturas, vouchers, embaixadores e comissões; acesso reservado ao SuperAdmin |
| `health` | Liveness sem autenticação em `/api/healthz` |

Clerk autentica adultos e contatos; tokens próprios e revogáveis são usados para Criança/aparelhos. A API falha no startup em produção se `PAIRING_RATE_LIMIT_SECRET` não tiver ao menos 32 caracteres. O webhook Stripe recebe o corpo bruto para verificar HMAC. O limitador persiste somente um HMAC da origem, não o IP em claro.

## 4. Banco de dados — PostgreSQL + Drizzle

O schema Drizzle declara 27 tabelas em 15 arquivos de schema (além do arquivo agregador `index.ts`):

`users`, `subscriptions`, `child_device_tokens`, `locations`, `contacts`, `conversations`, `messages`, `mirror_log`, `push_subscriptions`, `fcm_tokens`, `contact_invite_tokens`, `contact_device_tokens`, `contact_deletion_events`, `pairing_tokens`, `pairing_rate_limits`, `groups`, `group_members`, `group_messages`, `child_guardians`, `guardian_invite_tokens`, `screen_time_settings`, `screen_time_usage`, `child_locks`, `calls`, `vouchers`, `ambassadors` e `ambassador_commissions`.

### Migrations versionadas

| Arquivo | Mudança | Produção verificada antes do reparo |
|---|---|---|
| `0001_add_child_device_revoked_at.sql` | Revogação de tokens de aparelho infantil | Presente |
| `0002_pairing_schema_and_rate_limits.sql` | Código/tentativas de pareamento e tabela de rate limit | Aplicada e verificada |
| `0003_calls_and_contact_push_subscriptions.sql` | Chamadas, tipos de status e vínculo de push para contatos | Presente |
| `0004_admin_billing_and_growth.sql` | IDs Stripe, vouchers, embaixadores e comissões | Aplicada e verificada |
| `0005_subscription_guardians_limit.sql` | Limite de responsáveis por assinatura | Aplicada e verificada |

As migrations não rodam automaticamente no deploy. A checagem consultou somente a presença de tabelas e colunas em produção, sem ler registros pessoais. `0004` e `0005` foram tornadas reaplicáveis com `IF NOT EXISTS` e limites de espera de lock/execução, depois executadas e verificadas.

## 5. PWA — React, Vite e Clerk

Aplicativo em `artifacts/controle-parental-pwa`. A interface compartilha rotas conforme papel e sessão, com telas para painel, pareamento, espelho de conversas, convites/contatos, grupos, chat privado, localização, tempo de uso, perfil/configurações e cobrança. Também contém telas de convite/entrada, download infantil e painel SuperAdmin. O chat tem componentes de foto, áudio, emoji e figurinha; a PWA também implementa chamadas WebRTC.

O serviço de vendas encaminha `/superadmin`, autenticação e assets para a origem PWA do mesmo ambiente sem mudar o domínio visível. A raiz está associada a `site-vendas`; os subdomínios de Responsável e Criança apontam para `pwa`.

## 6. Apps nativos — React Native + Expo

`artifacts/controle-parental/native` contém telas e integração nativas. O app Responsáveis lista e pareia crianças, abre o espelho, compartilha localização, cria grupos com contatos aprovados e conversa em grupos. O app Criança pareia com código, conversa em privado, abre os grupos da família e compartilha a localização sob demanda. Ambos incluem chat nativo com texto, fotos e figurinhas e chamadas de voz/vídeo em primeiro plano. `app.config.js` gera duas identidades:

| Variante | Papel | Identificador Android/iOS |
|---|---|---|
| Responsáveis | Login Clerk, gestão da família, pareamento e conversa | `com.amparakids.responsavel` |
| Criança | Entrada pelo código familiar, chat, grupos e compartilhamento explícito de localização | `com.amparakids.crianca` |

O checklist nativo do repositório documenta APKs debug e builds iOS de simulador, além do código de chamada WebRTC. O APK TWA antigo foi removido da landing page; a página espera URLs oficiais das lojas e não distribui APK avulso. Não encontrei `.aab`, `.ipa` nem chaves de assinatura de lançamento. O Gradle agora recusa `release` sem keystore de upload e credenciais próprias, em vez de assinar release com a chave debug. Há um roteiro/scripts em `artifacts/controle-parental/STORE-RELEASE-GUIDE.md` para criar a chave Android e preparar os builds. Isso não equivale a builds assinados/distribuíveis nem a validação em aparelhos reais. O documento `artifacts/controle-parental/NATIVE-RELEASE-CHECKLIST.md` é a referência de publicação e ainda lista trabalho pendente.

## 7. SuperAdmin, vouchers e Stripe

O portal fica no mesmo domínio do Ampara: `https://amparakids.com/superadmin`. A autenticação é Clerk; o backend compara o usuário autenticado com `SUPERADMIN_CLERK_USER_IDS`. O painel tem visão geral, usuários/assinaturas, vouchers e embaixadores/comissões. O proxy de `site-vendas` evita expor Railway como domínio do portal.

Stripe Checkout usa `kids_solo`, `kids_duo` e `kids_family`, com preço mensal, trimestral e anual. Há fluxo para vouchers, referrals e atualização de assinaturas via webhook. As chaves e os nove IDs de preço de **teste** estão em staging. Em produção, faltam a chave secreta live, o segredo do webhook live e os nove IDs de preços live; até esses dados existirem, Checkout em produção deve responder como não configurado.

## 8. Integrações externas

| Serviço | Uso |
|---|---|
| Clerk | Sessão e identidade de usuários |
| Cloudflare Calls / TURN | Credenciais TURN efêmeras para WebRTC |
| Firebase Admin / FCM | Push nativo Android/iOS |
| Web Push/VAPID | Push da PWA/navegador |
| Stripe | Checkout, assinaturas e webhooks |
| PostgreSQL/Drizzle | Dados persistentes |
| Railway volumes | Mídia persistente |
| Sentry | Captura de erros quando DSN estiver configurada |

## 9. Estado confirmado após o merge do PR #6

- GitHub `main`: merge `6f0573bc` do PR #6.
- Railway produção: `api-server`, `pwa`, `site-vendas`, `landing page apps` e Postgres em `SUCCESS` no commit `6f0573b` após as correções. `/api/healthz`, `responsavel.amparakids.com` e `amparakids.com/superadmin` respondem HTTP 200. `/api/admin/overview` sem sessão retorna HTTP 401, como esperado pelo controle de acesso.
- Causa do primeiro build PWA: uma variável de produção vazia tinha nome literal de 80 caracteres, com quebras de linha e três nomes `VITE_*`. Foi removida; o novo build concluiu. `VITE_CLERK_PROXY_URL` pode ficar ausente, como em staging.
- O primeiro deploy da API parava por falta de `PAIRING_RATE_LIMIT_SECRET`. Foi gerado um segredo aleatório de 64 caracteres hexadecimais e configurado diretamente no Railway, sem ir ao Git.
- Banco de produção: migrations `0001` a `0005` presentes. `0002`, `0004` e `0005` foram aplicadas e verificadas.
- Ainda falta testar o fluxo de SuperAdmin autenticado, Stripe live e os apps nativos em aparelhos reais.

## 10. Estado atual e pendências de lançamento

1. Fazer login e testar o portal SuperAdmin autenticado; criar voucher/embaixador de teste e conferir acesso negado para outra conta. `/superadmin` e seus assets passam pelo domínio Ampara; o endpoint administrativo sem sessão devolve 401.
2. Criar e configurar a chave, webhook e preços Stripe live antes de habilitar cobrança real.
3. Compilar APKs release assinados e builds iOS para dispositivo/App Store; preencher metadados, privacidade e classificação etária.
4. Validar login, pareamento, chat, chamadas, notificações e revogação em aparelhos físicos Android e iPhone. Chamadas com o app em segundo plano/fechado e o restante da paridade nativa constam como pendentes no checklist nativo.
5. Confirmar situação do D-U-N-S/conta Google Play, equipe/certificados Apple e inserir as quatro URLs oficiais das lojas no serviço `landing page apps` (`CHILD_ANDROID_STORE_URL`, `CHILD_IOS_STORE_URL`, `PARENT_ANDROID_STORE_URL`, `PARENT_IOS_STORE_URL`).

### Fora desta versão

Pedidos de V3 estão listados em `docs/AMPARA-V3-ROADMAP.md`: temas/figurinhas/emojis extras, efeitos AR em chamadas, criação/edição criativa de figurinhas e jogos infantis entre participantes.
