#!/usr/bin/env bash
# crianca.amparakids.com com tela "Digite o código" + links sem o domínio do Railway.
set -euo pipefail
ROOT="$HOME/Projects/insightdisc"
cd "$ROOT"

echo "==> 1/4 Variáveis da API (links bonitos)"
railway variables --service api-server --environment production \
  --set "APP_URL=https://responsavel.amparakids.com" \
  --set "CHILD_APP_URL=https://crianca.amparakids.com"

echo "==> 2/4 Build de teste do app web"
pnpm --filter @workspace/controle-parental-pwa run build

echo "==> 3/4 Commit, PR e merge (Railway publica API e app web)"
git add artifacts/controle-parental-pwa/src artifacts/api-server/src/routes/pairing.ts artifacts/controle-parental/scripts/crianca-codigo-e-links.sh
git commit -m "feat(crianca): tela para digitar o codigo de 8 digitos e link de pareamento em crianca.amparakids.com

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015VFpxDs7kWcbaTDJvMQnoo" || echo "(nada novo para commitar)"
git push
gh pr create --base main --head codex/site-app-distribution \
  --title "Criança: digitar código em crianca.amparakids.com + links sem domínio Railway" \
  --body "- crianca.amparakids.com abre a tela 'Digite o código' (8 dígitos) em vez do cadastro do responsável.
- Link de erro de pareamento ganha botão 'Digitar um código'.
- Link de pareamento usa CHILD_APP_URL (crianca.amparakids.com); convites e cobrança usam APP_URL (responsavel.amparakids.com).
- Botão Espelho do painel traduzido.

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || echo "(PR já existe)"
gh pr merge --merge

echo "==> 4/4 Pronto. Em ~3 min abra https://crianca.amparakids.com no navegador anônimo."
