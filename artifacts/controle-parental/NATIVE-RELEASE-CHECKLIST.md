# Checklist de lançamento dos apps Ampara

## Implementado nesta etapa

- [x] Dois binários distintos: Responsáveis (`com.amparakids.responsavel`) e Criança (`com.amparakids.crianca`).
- [x] Login nativo do responsável pelo Clerk.
- [x] Lista de crianças da família e geração/reconexão pelo código de 8 dígitos.
- [x] App Criança aceita o código e guarda o token em armazenamento seguro do sistema.
- [x] Conversa privada de texto entre responsável e criança, com atualização automática.
- [x] Saída da Criança revoga no servidor o token do aparelho atual.
- [x] Criança pode compartilhar a localização atual sob demanda, após conceder permissão em primeiro plano; o responsável vê horário/precisão e abre o ponto no mapa.
- [x] Página `/baixar/crianca` detecta iOS/Android e encaminha para a loja quando os links estiverem configurados.
- [x] Verificados: TypeScript do workspace, build da API e build da PWA.
- [x] Compilação iOS da variante Criança concluída para simulador (sem assinatura de distribuição).
- [x] Compilação iOS da variante Responsáveis concluída para simulador anteriormente.

## Antes de enviar para as lojas

- [ ] Completar e validar chamadas de voz/vídeo nos apps nativos, incluindo chamada recebida em segundo plano.
- [ ] Portar e validar os demais recursos que já existem no PWA (contatos/grupos, mídias, localização em segundo plano e tempo de tela).
- [ ] Configurar notificações push nativas para iOS e Android e testar com aparelhos reais.
- [ ] Instalar, parear e testar cada app em aparelhos iPhone e Android, incluindo reconexão e revogação.
- [ ] Configurar os projetos nativos no Clerk com os dois bundle/application IDs.
- [ ] Criar builds assinados com as contas de publicação Apple e Google.
- [ ] Preencher as fichas das lojas, política de privacidade, termos, classificação etária e declarações de dados/permissões.
- [ ] Publicar os dois apps e inserir as URLs oficiais das lojas em `VITE_CHILD_IOS_STORE_URL` e `VITE_CHILD_ANDROID_STORE_URL`.

## Bloqueios externos conhecidos

- O acesso/publicação Google Play ainda aguarda liberação, conforme informado pelo responsável do projeto.
- A conta Apple está aprovada, mas este ambiente não tem acesso ao App Store Connect nem certificados/perfis de assinatura.
- O Mac deste ambiente não tem Java/JDK disponível; não foi possível validar um APK/AAB localmente.
- O build iOS do simulador não gera um arquivo assinado para distribuição. Ele valida compilação, não publicação nem funcionamento em aparelho.

Não considerar os apps prontos para lançamento até concluir todos os itens acima e fazer a validação em aparelhos reais.
