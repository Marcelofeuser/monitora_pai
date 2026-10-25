# Distribuir os apps pelo site do Ampara Kids

Este guia considera a decisão atual: disponibilizar os apps Android e iOS pelo
site do Ampara Kids, sem publicar nas lojas tradicionais.

## Android: APK assinado no site

O Android permite distribuir um APK de lançamento assinado pelo próprio site.
Ao instalar, cada pessoa precisa autorizar a instalação de apps daquela origem
nas configurações do Android.

1. Instale um JDK compatível com o Gradle do projeto e confirme `java -version`.
2. Se ainda não houver uma chave de assinatura preservada, crie-a localmente:
   `bash scripts/create-android-upload-key.sh`.
3. Guarde `~/.amparakids/credentials/android-upload.jks` e as senhas em um
   cofre seguro e faça cópia de backup. Não envie esses dados por chat, e-mail
   ou GitHub. A mesma chave deve assinar todas as atualizações dos dois apps.
4. Gere os APKs de lançamento:

   ```sh
   bash scripts/build-android-release.sh responsavel
   bash scripts/build-android-release.sh crianca
   ```

   O script solicita as senhas sem mostrá-las e grava
   `dist/releases/ampara-responsavel.apk` e
   `dist/releases/ampara-crianca.apk`.
5. Teste os APKs assinados em aparelhos Android reais antes de disponibilizá-los.
6. Hospede cada APK em HTTPS sob domínio controlado pelo Ampara Kids. Configure
   no serviço Railway `landing page apps` as variáveis
   `PARENT_ANDROID_APK_URL` e `CHILD_ANDROID_APK_URL` com os links públicos.
7. O portal detecta o sistema do aparelho e encaminha para o APK correspondente.
   O Android exibirá a confirmação e poderá pedir autorização para instalar
   apps baixados pelo navegador.

Não gere outra chave caso o arquivo atual já exista. Sem a chave original, uma
atualização instalada não poderá ser assinada como continuação da mesma linha.

## iPhone e iPad no Brasil

Um arquivo `.ipa` hospedado como um link comum não é um método de instalação
para consumidores no Brasil. Desde iOS 26.5, a instalação de apps do site no
Brasil acontece por meio de um **marketplace alternativo autorizado pela
Apple**. O marketplace é um app próprio com servidor e site; a Apple exige
autorização, conta Apple Developer de organização e critérios adicionais de
elegibilidade, além de responsabilidades contínuas de segurança e suporte.

Portanto, a conta Apple Developer pessoal informada até aqui não basta para
publicar o app diretamente pelo site. O botão de iPhone permanecerá informativo
até que exista uma via de distribuição aceita pela Apple. Não publique um link
para `.app` de simulador ou `.ipa` sem distribuição autorizada.

Para testes limitados em aparelhos, use um canal de teste Apple apropriado.
Isso é diferente do lançamento público solicitado e não deve ser apresentado
como download direto pelo site.

## Estado dos artefatos

- Os APKs existentes em `dist/` são de depuração e não servem como versão de
  distribuição.
- As pastas `.app` existentes são builds de simulador; não instalam em iPhone.
- O script Android agora produz APK assinado para hospedagem no site.
- A distribuição pública para iOS continua bloqueada até obter autorização e
  infraestrutura de marketplace alternativo da Apple.

Referências oficiais: [distribuição pelo site no Android](https://developer.android.com/studio/publish),
[requisitos de marketplace alternativo no Brasil](https://developer.apple.com/support/alternative-app-marketplace-br/) e
[opções de distribuição no Brasil](https://developer.apple.com/br/support/app-distribution-in-brazil/).
