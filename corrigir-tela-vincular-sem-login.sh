#!/usr/bin/env bash
set -euo pipefail

# Correcao definitiva (nao e diagnostico) pro erro "not_authenticated" na
# tela "Vincular dispositivo da crianca": essa tela nunca conferia se voce
# estava logado. Se a sessao caisse (ou abrisse numa aba nova sem login),
# o app deixava preencher o formulario inteiro e so ai mostrava o erro
# generico do servidor. Agora, sem sessao ativa, ele manda direto pra tela
# de login em vez de deixar tentar e falhar.
#
# Rode a partir de ~/Desktop/monitora_pai:
#   bash corrigir-tela-vincular-sem-login.sh

if [ ! -d ".git" ]; then
  echo "Erro: rode este script de dentro da pasta do repositorio (ex: ~/Desktop/monitora_pai)."
  exit 1
fi

echo "==> Atualizando repositorio local (git pull)..."
git pull

echo "==> Aplicando correcao..."
PATCH_FILE="$(mktemp)"
cat > "$PATCH_FILE" <<'PATCH_EOF'
diff --git a/artifacts/controle-parental-pwa/src/App.tsx b/artifacts/controle-parental-pwa/src/App.tsx
index f05a462..91cf58f 100644
--- a/artifacts/controle-parental-pwa/src/App.tsx
+++ b/artifacts/controle-parental-pwa/src/App.tsx
@@ -1212,7 +1212,27 @@ function Router() {
 // /join não exige o Responsável logado — é a rota que o QR code abre no
 // aparelho da Criança, que ainda não tem conta. /pair é o gerador do QR,
 // usado pelo Responsável já autenticado.
-function PairingRoute() { return <AppShell><PairingGenerate /></AppShell>; }
+//
+// Antes desta correção, /pair não conferia login nenhum: um Responsável
+// deslogado (sessão expirada, aba nova, etc.) conseguia preencher o
+// formulário e só descobria o problema com um erro genérico
+// "not_authenticated" vindo do servidor. Agora, se não tem sessão ativa,
+// manda direto pra tela de login em vez de deixar tentar e falhar.
+function RequireSignedIn({ children }: { children: ReactNode }) {
+  const { isLoaded, isSignedIn } = useAuth();
+  const [, setLocation] = useLocation();
+
+  useEffect(() => {
+    if (isLoaded && !isSignedIn) {
+      setLocation('/sign-in');
+    }
+  }, [isLoaded, isSignedIn, setLocation]);
+
+  if (!isLoaded || !isSignedIn) return null;
+  return <>{children}</>;
+}
+
+function PairingRoute() { return <RequireSignedIn><AppShell><PairingGenerate /></AppShell></RequireSignedIn>; }
 function DashboardRoute() { return <AppShell><Dashboard /></AppShell>; }
 function ConversationsRoute() { return <AppShell><Conversations /></AppShell>; }
 function LocationRoute() { return <AppShell><LocationPage /></AppShell>; }
PATCH_EOF

git apply "$PATCH_FILE"
rm -f "$PATCH_FILE"

echo "==> Adicionando arquivo..."
git add -A -- artifacts/controle-parental-pwa/src/App.tsx

echo "==> Criando commit..."
git commit -m "$(cat <<'COMMIT_EOF'
Corrige /pair pra exigir login: redireciona pro sign-in em vez de falhar com not_authenticated

A causa real do erro not_authenticated na tela de vincular dispositivo:
ela nunca conferia se o Responsavel estava logado antes de deixar gerar o
QR code. Sem sessao ativa, a chamada pro backend falhava com um erro
generico. Confirmado nos logs do Railway (hasAuthHeader: false - o
navegador simplesmente nao tinha um login ativo nesse momento).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gjMny7NXXrbAnQF6p1Ba6
COMMIT_EOF
)"

echo "==> Enviando pro GitHub (git push)..."
git push

echo ""
echo "=================================================================="
echo "Pronto! Depois que o deploy terminar (uns 2-3 min), faca um refresh"
echo "forcado (Cmd+Shift+R) e entre com sua conta se for solicitado."
echo "A partir de agora, se a sessao cair, o app te manda direto pra tela"
echo "de login em vez de mostrar aquele erro confuso."
echo "=================================================================="
