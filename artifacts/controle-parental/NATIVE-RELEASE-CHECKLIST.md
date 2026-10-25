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
- [x] Landing page `baixar.amparakids.com` identifica o sistema e tem rotas separadas para Criança e Responsáveis; QR de download da Criança separado do pareamento.
- [x] Verificados: TypeScript do workspace completo (incluindo chamadas nativas, API e PWA).
- [x] APK de debug Android do Responsável gerado e assinatura validada (`com.amparakids.responsavel`).
- [x] APK de debug Android da Criança gerado e assinatura validada (`com.amparakids.crianca`).
- [x] APKs Android recompilados com os grupos, gravação de voz e gestão de contatos atuais: `dist/ampara-responsavel-debug.apk` e `dist/ampara-crianca-debug.apk`.
- [x] Compilação iOS ARM para simulador concluída para ambas as variantes, com mínimo iOS 15.1 e sem assinatura de distribuição: `dist/Ampara-Responsavel-Audio-iOS151.app` e `dist/Ampara-Crianca-Audio-iOS151.app`.

## Antes de distribuir pelo site

- [x] Implementar chamadas de voz/vídeo entre Responsável e Criança enquanto ambos os apps estão abertos.
- [ ] Configurar chamadas recebidas com o app em segundo plano/fechado usando push nativo e validar em aparelhos reais.
- [x] Localização atual compartilhada sob ação da Criança e com permissão em primeiro plano. Nem a PWA nem os apps nativos fazem rastreamento contínuo ou em segundo plano.
- [ ] Se a família solicitar rastreamento em segundo plano, definir antes a experiência de consentimento revogável, indicador visível, frequência e retenção; a implementação atual não coleta localização passivamente. Validar o fluxo atual de localização, gravação e reprodução de voz em aparelhos reais.
- [ ] Configurar notificações push nativas para iOS e Android e testar com aparelhos reais.
- [ ] Instalar, parear e testar cada app em aparelhos iPhone e Android, incluindo reconexão e revogação.
- [ ] Validar chamadas de voz/vídeo e permissões de microfone/câmera em aparelhos iPhone e Android.
- [ ] Validar o contador e o bloqueio de tempo de uso em aparelhos reais; a contagem nativa ocorre enquanto o app está em primeiro plano e não impõe limites ao sistema operacional inteiro.
- [x] Recompilar APKs Android de debug com os grupos e a gestão nativa de contatos; ambos foram compilados e tiveram assinatura e identificador verificados.
- [ ] Configurar os projetos nativos no Clerk com os dois bundle/application IDs.
- [ ] Confirmar e preservar a chave Android de assinatura de lançamento. O script solicita os quatro valores localmente e o Gradle bloqueia builds `release` sem assinatura.
- [ ] Instalar e testar os APKs Android em aparelhos reais; não havia aparelho/emulador conectado neste Mac.
- [ ] Gerar os APKs assinados de lançamento com `scripts/build-android-release.sh responsavel` e `scripts/build-android-release.sh crianca`.
- [ ] Hospedar os APKs finais em HTTPS no domínio do Ampara Kids e configurar `PARENT_ANDROID_APK_URL` e `CHILD_ANDROID_APK_URL` no serviço Railway `landing page apps`.
- [ ] Testar o fluxo de download, autorização de instalação e atualização dos dois APKs em aparelhos Android reais.
- [ ] Definir com a Apple uma rota para iOS no Brasil. A instalação pública pelo site depende de marketplace alternativo autorizado pela Apple; conta pessoal e link direto para `.ipa` não bastam.
- [ ] Se a distribuição por marketplace Apple for aprovada, construir o marketplace, cumprir requisitos de segurança/suporte, autenticar os apps e configurar os destinos iOS no portal.

## Bloqueios externos conhecidos

- A criação e a preservação da chave Android de assinatura dependem de uma ação local do responsável; não há confirmação de que exista keystore pronto.
- Os APKs atuais são de debug, assinados com a chave de depuração, e não devem ser hospedados como lançamento.
- As compilações iOS atuais são de simulador e não instalam em iPhones.
- Para distribuição pública de iOS pelo site no Brasil, a Apple exige operação de marketplace alternativo autorizada. O requisito inclui conta Apple Developer de organização e critérios de elegibilidade (histórico de dois anos e mais de um milhão de instalações anuais, ou carta de crédito standby de US$ 1 milhão), além de obrigações operacionais.
- A disponibilidade de APK pelo site não exige publicação no Google Play, mas Android solicita que o usuário autorize instalação da origem.
- O WebRTC atual toca e conecta enquanto os dois apps estão abertos; não implementa ainda a experiência de chamada recebida com o app suspenso/fechado.
- A localização atual é compartilhada somente quando a Criança toca no botão e aceita a permissão enquanto usa o app; não existe rastreamento em segundo plano na PWA nem nos apps nativos.

Não considerar os apps prontos para lançamento até concluir todos os itens aplicáveis, validar em aparelhos reais e liberar uma rota compatível para iOS.
