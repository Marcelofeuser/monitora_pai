# Ampara — app Android (Responsável)

Este projeto é um **TWA (Trusted Web Activity)**: um app Android de verdade,
publicável na Play Store, que abre `https://responsavel.amparakids.com` em
tela cheia (sem barra de endereço do navegador). Não é uma reescrita do
app — ele continua sendo o mesmo PWA de sempre; qualquer atualização que
vocês derem no site já aparece pro usuário sem precisar atualizar o app na
Play Store. Notificação push (a que já existe em `lib/push.ts`) funciona
igual, porque por baixo é o próprio Chrome renderizando a página.

## Como abrir

1. Abra o Android Studio → **Open** → selecione esta pasta
   (`artifacts/android-responsavel`).
2. Se o Android Studio avisar que o **Gradle Wrapper** não foi encontrado
   (não incluí o `gradlew`/`gradle-wrapper.jar` de propósito — eles são
   arquivos binários que eu não consigo gerar daqui com segurança), clique
   em **"OK" / "Create Gradle Wrapper"** quando ele oferecer. Ele baixa o
   Gradle 8.7 sozinho na primeira vez (só funciona com o Mac com internet
   normal, o que já é o seu caso).
3. Espere o **Gradle Sync** terminar (primeira vez demora, baixa as
   dependências: `androidx.browser`, `androidx.appcompat`,
   `androidbrowserhelper` do Google).
4. Clique em **Run ▶** com um emulador ou celular Android conectado.

## Arquivos sensíveis (NÃO estão no git)

- `android.keystore` — a chave que assina o app. **Guarde uma cópia dela em
  local seguro fora do git** (ex: gerenciador de senhas, HD externo). Se
  você perder essa chave depois de publicar na Play Store, não tem como
  atualizar o app nunca mais com a mesma identidade — teria que publicar
  como um app novo do zero.
- `keystore.properties` — tem a senha do keystore. Também fica só no seu
  Mac, nunca vai pro GitHub (está no `.gitignore`).

## Antes do app abrir "de verdade" em tela cheia

O Android confirma que este app tem permissão de controlar
`responsavel.amparakids.com` lendo
`https://responsavel.amparakids.com/.well-known/assetlinks.json` — eu já
atualizei esse arquivo no PWA com o fingerprint do keystore novo (pasta
`artifacts/controle-parental-pwa/public/.well-known/assetlinks.json`), mas
ele só entra em produção depois que você der `git push` e o Railway fizer o
deploy. **Até lá o app funciona igual, só que com uma barrinha de endereço
no topo** (modo Custom Tab) — depois do deploy, na próxima abertura do app,
a barra some sozinha.

## Publicar na Play Store (quando quiser)

Precisa de uma conta de desenvolvedor Google Play (taxa única de US$25) —
essa parte só você consegue criar, é uma conta pessoal/da empresa sua. Me
chama quando chegar nessa etapa que eu ajudo com o resto (gerar o `.aab`
assinado, preencher a ficha da loja, etc).
