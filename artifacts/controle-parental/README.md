# Apps nativos Ampara

Este projeto React Native/Expo gera dois aplicativos Android independentes a
partir da mesma base compartilhada:

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

## APKs de verificação

Os arquivos `dist/ampara-responsavel-debug.apk` e
`dist/ampara-crianca-debug.apk` foram gerados e tiveram a assinatura e o
identificador do pacote conferidos. São APKs de depuração para instalação e
teste; a Google Play exige um build de lançamento assinado com a chave da
conta da empresa.

Antes de iniciar, copie `.env.example` para `.env` e configure a URL pública
do `api-server` e a publishable key do Clerk do ambiente de staging. A chave
publishable é própria do cliente; não use a secret key do Clerk no app.
No Clerk Dashboard, habilite a Native API e registre os apps Android com os
IDs `com.amparakids.responsavel` e `com.amparakids.crianca` antes de compilar.

O Expo usa `AMPARA_APP` para selecionar nome, ícone, esquema de links,
identificador Android/iOS e perfil fixo. Os dois apps podem ser instalados no
mesmo aparelho porque têm identificadores diferentes.

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
- Responsável e criança podem iniciar e atender chamadas de voz/vídeo quando
  os dois apps estão abertos. O servidor autentica a sinalização e fornece
  credenciais ICE/TURN; microfone e câmera só são solicitados ao iniciar ou
  atender uma chamada.

Contatos e grupos, mídias, localização em segundo plano e controle de tempo de
tela ainda precisam ser portados. Chamadas recebidas com o app fechado ou em
segundo plano dependem de push nativo e validação em aparelhos reais. O QR de
download depende dos links oficiais das lojas, ainda não publicados.
