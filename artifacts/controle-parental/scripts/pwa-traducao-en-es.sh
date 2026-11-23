#!/usr/bin/env bash
# App web (responsavel/crianca.amparakids.com): inglês completo + espanhol + correção do perfil local.
# Testa o build no Mac ANTES de publicar; só faz merge se o build passar.
set -euo pipefail
ROOT="$HOME/Projects/insightdisc"
cd "$ROOT"

echo "==> 1/3 Build de teste do app web"
pnpm --filter @workspace/controle-parental-pwa run build

echo "==> 2/3 Commit, PR e merge (Railway publica o app web sozinho)"
git add artifacts/controle-parental-pwa/src artifacts/controle-parental/scripts/pwa-traducao-en-es.sh
git commit -m "feat(pwa): traducao completa EN + espanhol (ES) + perfil local por conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015VFpxDs7kWcbaTDJvMQnoo" || echo "(nada novo para commitar)"
git push
gh pr create --base main --head codex/site-app-distribution \
  --title "App web: inglês completo, espanhol e perfil local por conta" \
  --body "- ~360 frases que estavam fixas em português agora passam por tx() (lib/i18n.ts + lib/i18n-dict.ts).
- Novo idioma: espanhol (botão 🇪🇸). Sem escolha salva, o idioma segue o navegador.
- Perfil local (nome/espaço) agora fica preso à conta Clerk: outra conta no mesmo navegador não vê o nome anterior.
- /superadmin continua só em português.

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || echo "(PR já existe)"
gh pr merge --merge

echo "==> 3/3 Pronto. Em ~3 min abra https://responsavel.amparakids.com e teste 🇧🇷 🇺🇸 🇪🇸"
