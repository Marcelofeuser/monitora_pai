# Plano Interno de Resposta a Incidentes de Segurança — Amparo

**Última atualização:** 08/09/2026
**Responsável:** Marcelo Feuser (controlador de dados, app Amparo)

> Este documento é operacional, não é parecer jurídico. Antes de comunicar formalmente a ANPD ou usuários em um incidente real, recomenda-se validação com advogado especializado em LGPD, especialmente por envolver dados de crianças (ECA Digital — Lei 15.211/2025).

## 1. Objetivo

Definir os passos que devem ser seguidos quando houver suspeita ou confirmação de um incidente de segurança envolvendo o Amparo — app de controle parental que processa dados de crianças e adolescentes (mensagens, localização, mídia, dados de cadastro).

Dado o perfil do app (dados sensíveis de menores), qualquer incidente aqui é tratado com prioridade máxima, mesmo em escala pequena de usuários.

## 2. O que conta como incidente

Qualquer evento que comprometa a confidencialidade, integridade ou disponibilidade dos dados dos usuários (crianças, responsáveis ou contatos). Exemplos:

- Acesso não autorizado ao banco de dados (produção ou staging)
- Vazamento de credenciais (Clerk, Railway, banco de dados, VAPID keys)
- Exposição pública indevida de conversas, localização, mídia ou dados de cadastro
- Comprometimento da conta do desenvolvedor (GitHub, Railway, Clerk)
- Falha de autorização que permita a um responsável ou contato ver dados de uma criança que não é sua
- Indisponibilidade prolongada do serviço que impeça responsáveis de monitorar em situação de risco
- Erro de deploy que exponha variáveis de ambiente ou segredos no código público

## 3. Classificação de severidade

| Nível | Critério | Exemplo |
|---|---|---|
| **Crítica** | Dados de crianças expostos, acessíveis publicamente, ou acesso indevido confirmado entre contas | Vazamento de banco de dados; bug de autorização cruzando dados entre famílias |
| **Alta** | Risco real de exposição, ainda não confirmado como explorado | Credencial vazada em log ou repositório público, mas sem evidência de uso indevido |
| **Média** | Falha de segurança sem exposição de dados pessoais | Vulnerabilidade identificada em dependência (via `npm audit`/Dependabot) sem exploração conhecida |
| **Baixa** | Indisponibilidade ou bug sem risco de dados | Serviço fora do ar, erro 500 isolado capturado pelo Sentry |

## 4. Papéis e responsabilidades

Hoje a operação é de uma pessoa só — Marcelo acumula todos os papéis abaixo. Isso deve ser revisado se a equipe crescer.

- **Detecção e triagem:** Marcelo (via Sentry, Railway, relatos de usuário)
- **Contenção técnica:** Marcelo
- **Comunicação com titulares/ANPD:** Marcelo (com apoio jurídico externo antes de qualquer comunicação formal)
- **Revisão pós-incidente:** Marcelo

## 5. Canais de detecção

- **Sentry** (backend e frontend) — erros não tratados e exceções em produção, alerta automático
- **Railway** — `environment-status`, logs, métricas de serviço; falhas de deploy
- **CI (GitHub Actions)** — falha de typecheck bloqueia merge, reduz risco de bug chegar em produção
- **Relato de usuário** — responsável ou contato reporta comportamento estranho (ex: "vejo dados de outra criança")
- **Verificação manual periódica** — checar `environment-status` e logs do Railway periodicamente

## 6. Fluxo de resposta

### 6.1 Identificação
Confirmar que é um incidente real (não falso positivo). Registrar data/hora da detecção e da suspeita de início do incidente.

### 6.2 Contenção
Ação imediata para impedir que o dano continue ou se espalhe:
- Revogar/rotacionar credenciais comprometidas (Clerk, Railway, VAPID, DB) — nunca reaproveitar uma credencial vazada
- Se for bug de autorização: reverter o deploy problemático (`git revert` + push) ou desativar a rota afetada
- Se for acesso indevido ativo: considerar colocar o serviço afetado em manutenção temporária

### 6.3 Erradicação
Corrigir a causa raiz — não só o sintoma. Escrever teste/validação que evite regressão quando possível.

### 6.4 Recuperação
Restaurar operação normal. Se houve corrupção/perda de dados, usar os backups do Postgres (volume backups diários/semanais + PITR, habilitados no Railway) para restaurar ao estado anterior ao incidente.

### 6.5 Comunicação
- **Interna:** registrar tudo (ver seção 8) antes de comunicar externamente.
- **Titulares afetados (LGPD art. 48):** se o incidente gerar risco relevante aos titulares, eles devem ser comunicados em prazo razoável, com linguagem clara — no caso de crianças, a comunicação é feita ao responsável.
- **ANPD:** incidentes com risco relevante aos titulares devem ser comunicados à Autoridade Nacional de Proteção de Dados. Antes de qualquer comunicação formal à ANPD, consultar advogado — o prazo e formato exigidos podem mudar conforme regulamentação vigente da ANPD.
- Nunca minimizar ou omitir escopo real do incidente na comunicação.

### 6.6 Pós-incidente
Documentar o incidente (seção 8), identificar melhorias de processo/código, e atualizar este plano se necessário.

## 7. Backup e recuperação de dados

- Banco Postgres de produção: backups automáticos de volume (diário + semanal) e Point-in-Time Recovery (PITR) habilitados no Railway — permite restaurar para qualquer momento dentro da janela de retenção.
- Restauração é feita pelo painel Railway (aba "Backups" do serviço postgres), gera novo volume a partir do snapshot escolhido — a mudança fica "staged" até confirmar o deploy.
- Testar a restauração periodicamente (ex: 1x a cada trimestre) no ambiente de staging, para garantir que o processo funciona quando for realmente necessário.

## 8. Registro do incidente (preencher a cada ocorrência)

Copiar o modelo abaixo para um novo arquivo em `docs/incidentes/AAAA-MM-DD-descricao-curta.md` a cada incidente real:

```
# Incidente — [data]

- Severidade: [crítica/alta/média/baixa]
- Detectado em: [data/hora] via [canal]
- Início estimado do incidente: [data/hora]
- Descrição: [o que aconteceu]
- Dados/usuários afetados: [escopo]
- Ações de contenção tomadas: [...]
- Causa raiz: [...]
- Correção aplicada: [...]
- Titulares/ANPD comunicados? [sim/não, quando]
- Lições aprendidas / próximos passos: [...]
```

## 9. Contatos de emergência

Preencher e manter atualizado (não deixar em branco por muito tempo):

- Suporte Railway: https://railway.com/help
- Suporte Clerk: https://clerk.com/support
- Advogado/consultoria LGPD: _[a definir]_
- ANPD (canal oficial de comunicação de incidentes): https://www.gov.br/anpd

## 10. Revisão deste plano

Revisar este documento a cada 6 meses ou após qualquer incidente real, o que ocorrer primeiro.
