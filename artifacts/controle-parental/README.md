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

Antes de iniciar, copie `.env.example` para `.env` e configure a URL pública
do `api-server` e a publishable key do Clerk do ambiente de staging. A chave
publishable é própria do cliente; não use a secret key do Clerk no app.
No Clerk Dashboard, habilite a Native API e registre os apps Android com os
IDs `com.amparakids.responsavel` e `com.amparakids.crianca` antes de compilar.

O Expo usa `AMPARA_APP` para selecionar nome, ícone, esquema de links,
identificador Android/iOS e perfil fixo. Os dois apps podem ser instalados no
mesmo aparelho porque têm identificadores diferentes.

## Fluxos implementados

- O app Responsáveis autentica pelo Clerk e gera QR usando `POST /api/pairing`.
- O app Criança lê o QR pela câmera, confirma em `POST /api/pairing/confirm` e
  guarda o token de dispositivo no armazenamento seguro do Android.
- O convite exige confirmação explícita do vínculo e a API aplica expiração e
  limite de tentativas.

Conversas, chamadas, localização em segundo plano e notificações nativas ainda
precisam ser ligados à API antes de distribuir os apps.
