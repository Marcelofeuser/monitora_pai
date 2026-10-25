# Checklist de lançamento dos apps Ampara

## Implementado nesta etapa

- [x] Dois binários distintos: Responsáveis (`com.amparakids.responsavel`) e Criança (`com.amparakids.crianca`).
- [x] Login nativo do responsável pelo Clerk.
- [x] Lista de crianças da família e geração/reconexão pelo código de 8 dígitos.
- [x] App Criança aceita o código e guarda o token em armazenamento seguro do sistema.
- [x] Conversa privada de texto entre responsável e criança, com atualização automática.
- [x] Envio de fotos, vídeos, gravações de voz de até 5 minutos e figurinhas no chat privado nativo, usando as rotas de mídia já existentes.
- [x] Responsável consulta o espelho de conversas da criança com contatos aprovados, em modo somente leitura; o chat privado familiar fica fora do espelho.
- [x] Apps nativos permitem ao responsável criar grupos com contatos já aprovados, e à criança abrir os grupos; ambos enviam e recebem texto, fotos, áudios e figurinhas.
- [x] App do responsável permite cadastrar contatos, gerar/compartilhar convites por QR e bloquear/reativar acesso.
- [x] App do responsável consulta tempo de uso do Ampara, define limite diário e pausa/libera o acesso; app da criança atualiza o uso em primeiro plano e respeita o bloqueio.
- [x] Saída da Criança revoga no servidor o token do aparelho atual.
- [x] Criança pode compartilhar a localização atual sob demanda, após conceder permissão em primeiro plano; o responsável vê horário/precisão e abre o ponto no mapa.
- [x] Landing page `baixar.amparakids.com` encaminha por sistema operacional quando as lojas estiverem configuradas; o QR nativo usa a rota da Criança por padrão. A correção do APK antigo está no PR #10.
- [x] Verificados: TypeScript do workspace completo (incluindo chamadas nativas, API e PWA).
- [x] APK de debug Android do Responsável gerado e assinatura validada (`com.amparakids.responsavel`).
- [x] APK de debug Android da Criança gerado e assinatura validada (`com.amparakids.crianca`).
- [x] Compilação iOS ARM para simulador concluída para ambas as variantes, com mínimo iOS 15.1 e sem assinatura de distribuição: `dist/Ampara-Responsavel-Audio-iOS151.app` e `dist/Ampara-Crianca-Audio-iOS151.app`.

## Antes de enviar para as lojas

- [x] Implementar chamadas de voz/vídeo entre Responsável e Criança enquanto ambos os apps estão abertos.
- [ ] Configurar chamadas recebidas com o app em segundo plano/fechado usando push nativo e validar em aparelhos reais.
- [ ] Portar e validar a localização em segundo plano que já existe no PWA. O chat nativo grava e reproduz mensagens de voz; uso do microfone e reprodução ainda precisam de validação em aparelhos reais.
- [ ] Configurar notificações push nativas para iOS e Android e testar com aparelhos reais.
- [ ] Instalar, parear e testar cada app em aparelhos iPhone e Android, incluindo reconexão e revogação.
- [ ] Validar chamadas de voz/vídeo e permissões de microfone/câmera em aparelhos iPhone e Android.
- [ ] Validar o contador e o bloqueio de tempo de uso em aparelhos reais; a contagem nativa ocorre enquanto o app está em primeiro plano e não impõe limites ao sistema operacional inteiro.
- [ ] Recompilar APKs Android de debug com os grupos e a gestão nativa de contatos; os APKs existentes foram compilados antes dessas mudanças.
- [ ] Configurar os projetos nativos no Clerk com os dois bundle/application IDs.
- [ ] Criar builds assinados com as contas de publicação Apple e Google.
- [ ] Criar/confirmar uma chave de upload Android e usá-la com `scripts/build-android-release.sh`. O script solicita os quatro valores localmente sem gravá-los no Railway ou GitHub. O Gradle bloqueia builds `release` sem assinatura de lançamento; a chave de depuração não é aceita para publicação.
- [ ] Instalar e testar os APKs Android em aparelhos reais; não havia aparelho/emulador conectado neste Mac.
- [ ] Preencher as fichas das lojas, política de privacidade, termos, classificação etária e declarações de dados/permissões.
- [ ] Publicar os quatro apps e configurar no serviço `landing page apps` as URLs `CHILD_ANDROID_STORE_URL`, `CHILD_IOS_STORE_URL`, `PARENT_ANDROID_STORE_URL` e `PARENT_IOS_STORE_URL`.

## Bloqueios externos conhecidos

- O acesso/publicação Google Play e a situação do D-U-N-S ainda dependem da verificação da empresa e da conta do responsável.
- Marcelo informou que tem uma conta pessoal Apple Developer. Os builds iOS atuais são de simulador e ainda não foram assinados; é preciso configurar/confirmar o acesso à equipe, certificados e perfis antes de distribuir ou publicar.
- Instruções e scripts para criar a chave Android com prompt seguro e gerar AABs separados estão em `STORE-RELEASE-GUIDE.md` e `scripts/`.
- Os APKs entregues são de debug, assinados com a chave de depuração. Servem para instalação/teste, não para publicação no Google Play.
- As compilações iOS de simulador validam que as duas variantes compilam, mas não geram arquivos assinados para iPhone/App Store nem substituem o teste em aparelho real.
- O WebRTC atual toca e conecta enquanto os dois apps estão abertos; não implementa ainda a experiência de chamada recebida com o app suspenso/fechado.

Não considerar os apps prontos para lançamento até concluir todos os itens acima e fazer a validação em aparelhos reais.
