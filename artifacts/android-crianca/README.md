# Ampara Kids — app Android (Criança)

Mesma ideia do app do Responsável: um **TWA (Trusted Web Activity)** que
abre `https://crianca.amparakids.com` em tela cheia, sem barra de endereço.
Continua sendo o mesmo PWA — qualquer atualização no site já aparece pro
app sozinha, sem precisar recompilar nem re-publicar na Play Store.

## Como abrir

1. Abra o Android Studio → **Open** → selecione esta pasta
   (`artifacts/android-crianca`).
2. Se o Android Studio avisar que o **Gradle Wrapper** não foi encontrado,
   clique em **"OK" / "Create Gradle Wrapper"** quando ele oferecer — ele
   baixa o Gradle 8.7 sozinho na primeira vez.
3. Espere o **Gradle Sync** terminar.
4. Clique em **Run ▶** com um emulador ou celular Android conectado.

## Arquivos sensíveis (NÃO estão no git)

- `android.keystore` — a chave que assina este app (é uma chave **diferente**
  da do app do Responsável — cada app tem a sua). Guarde uma cópia em local
  seguro fora do git.
- `keystore.properties` — senha do keystore, também fica só no seu Mac.

## Antes do app abrir "de verdade" em tela cheia

Mesma lógica do app do Responsável: o Android confirma a permissão lendo
`https://crianca.amparakids.com/.well-known/assetlinks.json`. Como
`crianca.amparakids.com` e `responsavel.amparakids.com` são servidos pelo
mesmo serviço no Railway (o `pwa`), o mesmo arquivo
`artifacts/controle-parental-pwa/public/.well-known/assetlinks.json` já
tem as duas entradas (uma pra cada app/pacote). Só precisa do
`git push` + deploy pra valer.

## Publicar na Play Store

Mesma observação do outro app: precisa de conta de desenvolvedor Google
Play (US$25, única vez), você que cria. Me chama quando chegar nessa parte.
