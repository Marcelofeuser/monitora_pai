# Staging: inicialização, autenticação e validação sem Railway

Complemento ao roteiro de pareamento. A falha de healthcheck de setembro não
teve seus logs recuperados: estas correções eliminam fragilidades identificadas
no código, mas não confirmam a causa daquele deploy.

## Alterações

- `/api/healthz` responde GET/HEAD antes do middleware de autenticação e do
  parsing do corpo. Não faz chamadas ao Clerk nem ao banco. É liveness do
  processo HTTP, não uma prova de que o schema ou o login estejam funcionando.
- Rotas funcionais continuam passando pelo Clerk. Configurações inválidas no
  startup, inclusive ausência de segredo do limiter em produção, continuam
  impedindo que a API inicialize.
- `CLERK_AUTHORIZED_PARTIES` aceita uma lista de origens separadas por vírgula,
  compartilhada por HTTP e Socket.IO. Quando definida, substitui os domínios
  padrão: staging pode ser isolado de produção. Quando ausente, preserva os
  cinco domínios anteriores para compatibilidade.
- Origens HTTPS, sem caminhos, credenciais ou curingas. HTTP localhost é
  permitido apenas fora de NODE_ENV=production. Esse NODE_ENV também é usado
  no staging publicado: não significa que staging deva aceitar origens inseguras.
- Servidor escuta explicitamente em `0.0.0.0` na porta inteira entre 1 e 65535.
  Falhas de escuta como EADDRINUSE têm log estruturado e saída com código 1.
- CI agora é disparado por push nas branches `main`, `staging` e
  `fix/pareamento-seguro`, além de PR para main. O job provisiona seu próprio
  PostgreSQL 16 no GitHub Actions; não usa os bancos da Railway.

## Caminho para concluir os seis testes PostgreSQL

1. Aplicar os dois patches, revisar o diff e incluir os arquivos novos no commit.
2. Enviar a branch `fix/pareamento-seguro` para o remoto correto. Antes, conferir
   `git remote -v` e a branch. Não fazer merge em main/staging nesta etapa.
3. Abrir Actions no repositório GitHub e conferir o workflow **Typecheck** do
   commit enviado. Ele inclui typecheck, suíte API com PostgreSQL e builds.
4. O job espera 55 testes aprovados: 49 sem banco e 6 de PostgreSQL real.
   Isso é a contagem esperada após os patches, não um resultado remoto já obtido.
5. Se falhar, usar o primeiro erro do job para corrigir. Não é necessário criar
   outro PostgreSQL na Railway só para essa suíte nem instalar Docker no Mac.

Um push pode disparar automações já existentes no repositório/serviços. Conferir
que Railway staging continua associado à branch staging e produção à branch
prevista, sem apontar ambos para a branch de correção.

## Quando a Railway estiver disponível

- [ ] Substituir as credenciais expostas e atualizar todos os consumidores,
  verificando quais ambientes compartilham cada credencial.
- [ ] Corrigir `APP_URL` do api-server de staging para a URL real da PWA de
  staging. Esse valor controla os links de convite/QR, não a validação de JWT.
- [ ] Configurar `CLERK_AUTHORIZED_PARTIES` com as origens reais e confiáveis
  dos frontends de staging. Não usar asterisco nem copiar os padrões de produção.
- [ ] Conferir que o par de chaves Clerk e a configuração de frontend pertencem
  à instância pretendida. Não colar chaves secretas em conversa ou repositório.
- [ ] Configurar `PAIRING_RATE_LIMIT_SECRET` persistente e proxy conforme o
  roteiro `pareamento-validacao-e-deploy.md`.
- [ ] Conferir conexão e schema do banco de staging, migrations 0001 e 0002.
- [ ] Publicar o commit revisado em staging e conferir o SHA implantado.
- [ ] Confirmar GET `/api/healthz` = 200 e logs de inicialização sem erro.
- [ ] Fazer smoke de login, QR, confirmação, reconexão, revogação e chamadas.
  Healthcheck 200 sozinho não comprova essas funcionalidades.
- [ ] Só então preparar publicação e smoke em produção.

## Validação local desta etapa

17 testes novos (13 de configuração e 4 de healthcheck) e 1 teste existente
de integração de revogação do signaling aprovados. Typecheck e build da API
aprovados. Smoke do processo compilado: healthcheck com Bearer inválido e banco
indisponível, rejeição de portas inválidas e tratamento de porta ocupada.

Os 32 testes anteriores e o typecheck completo do Mac permanecem registrados.
Não houve execução remota de CI, acesso aos bancos, rotação de credenciais
nem publicação nesta etapa. Os seis testes de PostgreSQL real continuam
pendentes até o resultado do CI ou execução em banco descartável.
