#!/usr/bin/env bash
# Publica a correção de mídia na API e abre os dois projetos iOS para Archive.
# Ampara (responsável) build 18 · Ampara Kids build 9.
set -euo pipefail
ROOT="$HOME/Projects/insightdisc"
APP="$ROOT/artifacts/controle-parental"
cd "$ROOT"

echo "==> 1/3 Conferindo números de build"
grep -q "CURRENT_PROJECT_VERSION = 18" "$APP/ios-responsavel/Ampara.xcodeproj/project.pbxproj"
grep -q "CURRENT_PROJECT_VERSION = 9" "$APP/ios/AmparaCriana.xcodeproj/project.pbxproj"

echo "==> 2/3 Commit, PR e merge (API sobe sozinha no Railway)"
git add artifacts/api-server/src/lib/mediaStorage.ts \
        artifacts/api-server/src/middlewares/mediaUpload.ts \
        artifacts/controle-parental/native/PrivateChat.tsx \
        artifacts/controle-parental/app.config.js \
        artifacts/controle-parental/scripts/ios-builds-18-9.sh
git commit -m "fix(midia): HEIC/HEIF na API e fotos/videos compativeis no app (builds 18 e 9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015VFpxDs7kWcbaTDJvMQnoo" || echo "(nada novo para commitar)"
git push
gh pr create --base main --head codex/site-app-distribution \
  --title "fix: fotos do iPhone (HEIC) + builds 18/9" \
  --body "API aceita image/heic e image/heif e registra no log o tipo recusado. App exporta JPEG/H.264 no seletor de fotos. Ampara build 18, Kids build 9.

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || echo "(PR já existe)"
gh pr merge --merge

echo "==> 3/3 Abrindo os projetos no Xcode"
osascript -e 'quit app "Xcode"' || true
sleep 3
open "$APP/ios-responsavel/Ampara.xcworkspace"
echo
echo "PRONTO."
echo "Ampara: espere 'Resolving Package Graph' terminar -> Any iOS Device -> Product > Archive -> Distribute > App Store Connect."
echo "Depois abra o Kids:  open \"$APP/ios/AmparaCriana.xcworkspace\"  e faça o mesmo."
