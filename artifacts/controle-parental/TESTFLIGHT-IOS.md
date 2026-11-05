# iOS pela loja oficial (TestFlight / App Store)

Este guia é para quem já tem conta Apple Developer ativa e já tem os apps
cadastrados no App Store Connect/TestFlight. É um caminho diferente do
`STORE-RELEASE-GUIDE.md`, que trata de distribuir pelo site do Ampara Kids —
aquele caminho exige um marketplace alternativo autorizado pela Apple no
Brasil. Indo pela loja oficial, essa exigência não existe.

Hoje só existem builds de simulador iOS (`dist/*.app`), que não instalam em
iPhone de verdade. Falta gerar um build assinado para distribuição, o que é
feito com o EAS Build (roda na nuvem da Expo, não precisa de Mac).

## 1. Login na Expo

```sh
cd artifacts/controle-parental
npx eas-cli login
```

Use a conta Expo da equipe (crie uma gratuita em expo.dev se ainda não tiver).

## 2. Vincular o projeto ao EAS

```sh
npx eas-cli init
```

Isso grava um `extra.eas.projectId` em `app.json`. Como os dois apps
(Responsável `com.amparakids.responsavel` e Criança `com.amparakids.crianca`)
compartilham o mesmo projeto Expo, um único `projectId` serve para as duas
variantes — o EAS gerencia as credenciais de cada bundle identifier
separadamente.

## 3. Configurar credenciais Apple

```sh
npx eas-cli credentials
```

Siga o fluxo interativo escolhendo iOS. O EAS pode gerar certificado de
distribuição e provisioning profile automaticamente usando login da sua conta
Apple Developer (ou Apple ID + senha de app específica, ou API key do App
Store Connect — o EAS orienta na hora). Repita para os dois bundle
identifiers (responsavel e crianca).

## 4. Gerar os builds assinados

```sh
pnpm run build:ios:responsavel
pnpm run build:ios:crianca
```

Cada comando builda na nuvem da Expo e no final devolve um link para baixar
o `.ipa` ou enviar direto ao App Store Connect.

## 5. Enviar para o TestFlight

```sh
pnpm run submit:ios:responsavel
pnpm run submit:ios:crianca
```

O comando pede o Apple ID (e-mail), o ID numérico do app no App Store Connect
(`ascAppId`) e, se usar autenticação de dois fatores, uma senha de app
específica gerada em appleid.apple.com. Depois do envio, o build aparece em
*App Store Connect → TestFlight* em alguns minutos (às vezes até 1h para
processar).

## 6. Testar no iPhone de verdade

1. No App Store Connect, adicione seu Apple ID (e o da sua filha, se for
   testar no iPhone dela) como testador interno/externo do TestFlight.
2. Instale o app **TestFlight** (esse sim está na App Store normal) no
   iPhone.
3. Abra o convite de teste (chega por e-mail ou pelo link do TestFlight) e
   instale o Ampara por lá.

Isso substitui totalmente a necessidade de usar os `.app` de simulador ou
builds de debug. Uma vez validado no TestFlight, o mesmo build pode ser
promovido para revisão e lançamento público na App Store.

## Pendências antes de enviar para revisão pública

Ver `NATIVE-RELEASE-CHECKLIST.md` — os itens de push nativo em segundo plano,
validação em aparelho real e configuração do Clerk para os dois bundle IDs
continuam valendo independente da rota de distribuição escolhida.
