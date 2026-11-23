#!/usr/bin/env bash
# Ampara (responsável) — prepara o build 17 com login Google + Apple.
# Uso:  bash ~/Projects/insightdisc/artifacts/controle-parental/scripts/ios-responsavel-build17.sh
set -euo pipefail
ROOT="$HOME/Projects/insightdisc"
APP="$ROOT/artifacts/controle-parental"

echo "==> 1/4 Instalando dependências (expo-apple-authentication)"
cd "$ROOT"
pnpm install

echo "==> 2/4 Conferindo build 17 e entitlement do Sign in with Apple"
grep -q "com.apple.developer.applesignin" "$APP/ios-responsavel/Ampara/Ampara.entitlements" \
  || { echo "ERRO: entitlement do Apple ausente"; exit 1; }
grep -q "CURRENT_PROJECT_VERSION = 17" "$APP/ios-responsavel/Ampara.xcodeproj/project.pbxproj" \
  || { echo "ERRO: build number não é 17"; exit 1; }

echo "==> 3/4 pod install"
cd "$APP/ios-responsavel"
export NODE_BINARY=/opt/homebrew/bin/node
pod install

echo "==> 4/4 Commit e push"
cd "$ROOT"
git add artifacts/controle-parental/native/ParentApp.tsx \
        artifacts/controle-parental/app.config.js \
        artifacts/controle-parental/package.json \
        artifacts/controle-parental/native/api.ts \
        artifacts/api-server/src/lib/accountDeletion.ts \
        artifacts/api-server/src/routes/me.ts \
        artifacts/controle-parental/scripts/ios-responsavel-build17.sh \
        pnpm-lock.yaml
git commit -m "feat(app-responsavel): login Google/Apple + excluir conta (build 17)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015VFpxDs7kWcbaTDJvMQnoo" || echo "(nada novo para commitar)"
git push || echo "AVISO: push falhou, rode 'git push' depois"

echo
echo "PRONTO. Agora no Xcode (vai abrir):"
echo "  Signing & Capabilities -> confira se aparece 'Sign in with Apple'"
echo "  Product -> Archive -> Distribute App -> App Store Connect"
open "$APP/ios-responsavel/Ampara.xcworkspace"
