# Apps nativos Ampara

Este projeto React Native/Expo gera dois aplicativos independentes para
Android e iOS a partir da mesma base compartilhada:

| Variante | Nome instalado | Application ID | Perfil |
| --- | --- | --- | --- |
| `responsavel` | Ampara Responsáveis | `com.amparakids.responsavel` | Responsável |
| `crianca` | Ampara Criança | `com.amparakids.crianca` | Criança |

## Android

Com Android Studio, Android SDK e um dispositivo ou emulador configurados:

```sh
pnpm --filter @workspace/controle-parental android:responsavel
pnpm --filter @workspace/controle-parental android:crianca
```

Para gerar o projeto Android nativo de cada variante sem iniciar a instalação:

```sh
pnpm --filter @workspace/controle-parental prebuild:responsavel
pnpm --filter @workspace/controle-parental prebuild:crianca
```

Para abrir a variante desejada no simulador iOS:

```sh
cd artifacts/controle-parental
AMPARA_APP=responsavel pnpm exec expo run:ios
AMPARA_APP=crianca pnpm exec expo run:ios
```

## Artefatos locais de verificação

Os arquivos `dist/ampara-responsavel-debug.apk` e
`dist/ampara-crianca-debug.apk` foram gerados e tiveram a assinatura e o
identificador do pacote conferidos. São APKs de depuração para instalação e
teste; a distribuição pelo site exige um build de lançamento assinado. As
pastas `.app` em `dist/` são builds de simulador iOS,
sem assinatura de distribuição, e não podem ser instaladas em iPhones.

## Assinatura de lançamento Android

O build `release` não usa a chave de depuração. Para gerar um APK de
lançamento, configure no ambiente de build `ANDROID_KEYSTORE_FILE`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`.
O projeto falha explicitamente se alguém tentar gerar um artefato `release`
sem as quatro configurações. Guarde o arquivo keystore e as senhas em local
seguro e fora do repositório; a chave de assinatura deve ser preservada para as
próximas atualizações. O arquivo mantém o nome legado `android-upload.jks` para
reaproveitar uma chave que já possa ter sido criada anteriormente.

Antes de iniciar, copie `.env.example` para `.env` e configure a URL pública
do `api-server` e a publishable key do Clerk do ambiente de staging. A chave
publishable é própria do cliente; não use a secret key do Clerk no app.
No Clerk Dashboard, habilite a Native API e registre os apps Android com os
IDs `com.amparakids.responsavel` e `com.amparakids.crianca` antes de compilar.

O Expo usa `AMPARA_APP` para selecionar nome, ícone, esquema de links,
identificador Android/iOS e perfil fixo. Os dois apps podem ser instalados no
mesmo aparelho porque têm identificadores diferentes.

Consulte [`STORE-RELEASE-GUIDE.md`](STORE-RELEASE-GUIDE.md) para criar a chave
de assinatura Android localmente, gerar APKs para o site e entender o estado da
distribuição pública iOS pelo site no Brasil.

## Fluxos implementados

- O app Responsáveis autentica pelo Clerk, lista os perfis da família e gera
  um código numérico de 8 dígitos usando `POST /api/pairing`.
- O app Criança informa o código em `POST /api/pairing/confirm` e guarda o
  token do dispositivo no armazenamento seguro do aparelho.
- Responsável e criança trocam mensagens de texto no canal privado da família;
  o histórico atualiza automaticamente, ambos podem enviar fotos e figurinhas,
  e o app da criança pode revogar o token deste aparelho ao sair.
- O convite exige confirmação explícita do vínculo e a API aplica expiração e
  limite de tentativas.
- O Responsável gerencia contatos e grupos com convites por QR/link, aprovação,
  bloqueio e reativação; o chat aceita texto, fotos, vídeos, voz e figurinhas.
- O Responsável consulta o espelho de conversas aprovadas, configura limite e
  bloqueio do uso do app Ampara e consulta a localização compartilhada.
- A Criança compartilha a localização atual apenas quando toca no botão e
  concede permissão em primeiro plano. O app e a PWA não fazem rastreamento
  contínuo ou em segundo plano.
- Responsável e criança podem iniciar e atender chamadas de voz/vídeo quando
  os dois apps estão abertos. O servidor autentica a sinalização e fornece
  credenciais ICE/TURN; microfone e câmera só são solicitados ao iniciar ou
  atender uma chamada.

Chamadas recebidas com o app fechado ou em segundo plano dependem de push
nativo, integração de chamada do sistema e validação em aparelhos reais.
Notificações nativas e funcionamento em aparelhos físicos continuam pendentes.
O QR depende dos links HTTPS dos APKs Android no site; a distribuição pública
iOS pelo site no Brasil depende de marketplace alternativo autorizado pela
Apple. O checklist e o guia estão em `NATIVE-RELEASE-CHECKLIST.md` e
`STORE-RELEASE-GUIDE.md`.
