# Preparar os apps para as lojas

## Android: chave de upload e AAB

Antes de começar, instale um JDK 17 ou compatível com o Gradle 8.14.3 e confirme que `java -version` funciona no Terminal.

1. No Terminal, entre em `artifacts/controle-parental`.
2. Crie a chave localmente: `bash scripts/create-android-upload-key.sh`.
3. Guarde o arquivo `~/.amparakids/credentials/android-upload.jks` e as senhas em um cofre seguro. Faça uma cópia de backup fora deste Mac. **Não envie a chave nem as senhas por chat, e-mail ou GitHub.**
4. No Google Play Console, use `android-upload-certificate.pem` quando o cadastro do app pedir o certificado da chave de upload.
5. Gere cada AAB com o prompt protegido (não salva as senhas):

   ```sh
   bash scripts/build-android-release.sh responsavel
   bash scripts/build-android-release.sh crianca
   ```

   Cada chamada pede as senhas sem mostrá-las e grava uma cópia com nome próprio em `dist/releases/ampara-responsavel.aab` ou `dist/releases/ampara-crianca.aab`.

O projeto não gera `release` assinado com a chave debug. Se a chave de upload já existir no Play Console, use essa mesma chave; criar outra pode impedir atualizações sem uma redefinição no Play Console.

## iOS: assinatura e TestFlight

1. Abra o Xcode e entre na conta Apple Developer em **Xcode → Settings → Accounts**. Selecione a equipe correta.
2. Gere ou confirme um certificado Apple Distribution e perfis para `com.amparakids.responsavel` e `com.amparakids.crianca`.
3. Ative a assinatura automática no Xcode para cada bundle ID e confirme os recursos necessários, incluindo notificações push quando a implementação nativa estiver pronta.
4. Arquive cada variante para um dispositivo iOS e envie pelo Organizer ao App Store Connect/TestFlight.
5. Preencha a ficha de cada app, privacidade, classificação etária, termos e política de privacidade antes de solicitar revisão.

## Ainda dependente de contas/publicação

- A conta Google Play e a verificação D-U-N-S informadas anteriormente precisam estar liberadas para criar/publicar apps.
- O time/certificado Apple precisa aparecer no Xcode. Neste Mac, a verificação anterior encontrou zero certificados e zero perfis de distribuição.
- Após aprovação/publicação, configure no Railway `landing page apps` as quatro URLs `CHILD_ANDROID_STORE_URL`, `CHILD_IOS_STORE_URL`, `PARENT_ANDROID_STORE_URL` e `PARENT_IOS_STORE_URL`.
- O lançamento completo ainda exige concluir os itens do [checklist nativo](NATIVE-RELEASE-CHECKLIST.md), incluindo chamadas em segundo plano, push e testes em aparelhos reais.
