#!/usr/bin/env bash
# 1.1 — Zoom de foto no chat (apps nativos + app web). Sem migração, sem novo build iOS agora.
set -euo pipefail
ROOT="$HOME/Projects/insightdisc"
cd "$ROOT"

echo "==> 1/3 Build de teste do app web"
pnpm --filter @workspace/controle-parental-pwa run build

echo "==> 2/3 Commit, PR e merge (Railway publica o app web)"
git add artifacts/controle-parental/native/PrivateChat.tsx \
        artifacts/controle-parental-pwa/src/components/message-content.tsx \
        artifacts/controle-parental-pwa/src/lib/i18n-dict.ts \
        artifacts/controle-parental/scripts/v11-zoom-foto.sh
git commit -m "feat(chat): tocar na foto abre em tela cheia com zoom (nativo e web)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015VFpxDs7kWcbaTDJvMQnoo" || echo "(nada novo para commitar)"
git push
gh pr create --base main --head codex/site-app-distribution \
  --title "1.1: zoom de foto no chat" \
  --body "- Nativo (Ampara e Ampara Kids): tocar na foto abre tela cheia; pinça amplia até 4x (iOS), toque duplo alterna zoom, botão ✕ fecha.
- Web: foto abre em lightbox; clique fora, ✕ ou Esc fecha. Textos em PT/EN/ES.
- Sem migração de banco. Apps nativos entram no próximo build (1.1).

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || echo "(PR já existe)"
gh pr merge --merge

echo "==> 3/3 Pronto. Em ~3 min teste em https://responsavel.amparakids.com: abra um chat e toque numa foto."
