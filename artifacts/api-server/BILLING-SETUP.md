# Configuração do portal administrativo e Stripe

## Variáveis do serviço `api-server`

Configure no gerenciador de segredos do ambiente (não no Git):

- `SUPERADMIN_CLERK_USER_IDS`: IDs Clerk separados por vírgula. Só essas contas podem abrir `/superadmin` e chamar `/api/admin/*`.
- `STRIPE_SECRET_KEY`: chave privada Stripe de teste ou produção, adequada ao ambiente.
- `STRIPE_WEBHOOK_SECRET`: segredo do endpoint webhook Stripe deste ambiente.
- `STRIPE_PRICE_KIDS_SOLO_MONTHLY`, `STRIPE_PRICE_KIDS_SOLO_QUARTERLY`, `STRIPE_PRICE_KIDS_SOLO_ANNUAL`.
- `STRIPE_PRICE_KIDS_DUO_MONTHLY`, `STRIPE_PRICE_KIDS_DUO_QUARTERLY`, `STRIPE_PRICE_KIDS_DUO_ANNUAL`.
- `STRIPE_PRICE_KIDS_FAMILY_MONTHLY`, `STRIPE_PRICE_KIDS_FAMILY_QUARTERLY`, `STRIPE_PRICE_KIDS_FAMILY_ANNUAL`.
  Cada variável recebe o ID `price_...` do preço correspondente no mesmo ambiente Stripe.
- `AMPARA_APP_URL`: origem HTTPS do app do responsável; usada nos retornos do checkout. Se omitida, usa `APP_URL` do ambiente; último padrão: `https://responsavel.amparakids.com`.

O portal está em `/superadmin`; o checkout autenticado está em `/billing`. A landing page da marca encaminha cada plano para cadastro/login e, depois, para o checkout selecionado.

Prefira uma chave restrita com as permissões mínimas necessárias para Checkout, cupons e consulta de assinaturas. Use uma chave diferente para staging e produção.

## Stripe

Crie três produtos no Stripe, um por plano, e três preços recorrentes por produto, em BRL:

| Plano | Mensal | Trimestral (a cada 3 meses) | Anual (a cada 12 meses) |
| --- | ---: | ---: | ---: |
| Kids Solo | R$ 24,90 | R$ 56,03 | R$ 286,85 |
| Kids Duo | R$ 34,90 | R$ 78,53 | R$ 402,05 |
| Kids Family | R$ 44,90 | R$ 101,03 | R$ 517,25 |

Os totais trimestrais aplicam 25% de desconto ao total de três mensalidades; os anuais aplicam 4% ao total de doze mensalidades. Os trimestrais foram arredondados para cima ao centavo mais próximo quando o cálculo resultou em meio centavo. Use estas descrições nos produtos Stripe e mantenha-as alinhadas à landing page:

- **Kids Solo:** Para responsáveis: gerencie o perfil e o pareamento de 1 criança e converse com ela no espaço familiar. Para a criança: converse com a família, envie fotos e figurinhas. Chamadas de voz e vídeo disponíveis com os dois apps abertos. Inclui até 2 responsáveis.
- **Kids Duo:** Para responsáveis: gerencie os perfis de até 2 crianças e compartilhe o espaço familiar com até 3 responsáveis. Para as crianças: conversem com a família, enviem fotos e figurinhas. Chamadas de voz e vídeo disponíveis com os dois apps abertos.
- **Kids Family:** Para responsáveis: gerencie os perfis de 3 ou mais crianças e compartilhe o espaço familiar com até 4 responsáveis. Para as crianças: conversem com a família, enviem fotos e figurinhas. Chamadas de voz e vídeo disponíveis com os dois apps abertos.

Esses textos descrevem recursos atuais da versão nativa conforme o estado do projeto; não inclua como benefícios os recursos futuros da V3.0. Antes de publicar preços ou descrições no Stripe, confirme que os limites de crianças e responsáveis são aplicados pelo serviço de produção.

Cadastre os nove IDs nas variáveis acima para habilitar as opções. Registre no Stripe um webhook para `POST https://<api-origin>/api/billing/webhook` com os eventos `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` e `invoice.paid`. O webhook valida a assinatura com o segredo específico do ambiente e recusa payloads sem assinatura válida.

Comece com chaves de teste e URLs de teste; produção precisa de chaves, IDs de preço e segredo de webhook próprios. Não coloque chaves privadas no frontend, nos apps móveis ou neste repositório.

Vouchers percentuais ou de valor fixo são aplicados como cupom Stripe na primeira cobrança da assinatura. O limite de resgates e a data de validade são enviados ao Stripe. Comissão percentual e benefício fixo de embaixador são registrados quando a fatura paga chega pelo webhook; o pagamento ao embaixador permanece manual, com status conciliável no portal.

## Banco

As tabelas novas estão no schema Drizzle (`vouchers`, `ambassadors`, `ambassador_commissions`) e as assinaturas guardam os IDs Stripe. Antes de publicar em qualquer ambiente, aplique a atualização do schema com a rotina de banco aprovada para aquele ambiente e valide o resultado. A rota administrativa não cria permissões dinamicamente: IDs de superadmin só são aceitos pela allowlist acima.
