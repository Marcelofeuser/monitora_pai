import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { getGuardianInviteInfo, acceptGuardianInvite } from '@/lib/guardians-api';
import { ThemeSwitcher } from '@/lib/theme';
import { Users } from 'lucide-react';

/**
 * Rota /aceitar-responsavel?token=... — pra onde aponta o link/QR gerado
 * pelo Responsável ao convidar um segundo Responsável pro mesmo espaço
 * (item 13 do pedido: "2º responsável cria conta própria por um link de
 * convite e compartilha o mesmo espaço/mesmas crianças").
 *
 * Diferente do convite de Contato (ContactJoin.tsx): quem aceita PRECISA
 * de uma conta Clerk de verdade (vira um Responsável igual a quem
 * convidou, com login próprio) — então esta tela só confirma o convite
 * sozinha quando a pessoa já está logada. Se não estiver, guarda o token
 * pendente e manda pro /sign-in ou /sign-up normais do app; o efeito no
 * AppShell (ver App.tsx) confirma o convite pendente assim que a pessoa
 * cai logada em qualquer tela.
 */
const PENDING_GUARDIAN_INVITE_KEY = 'amparo-pending-guardian-invite';

export function GuardianJoin() {
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'done' | 'error' | 'no_token'>('loading');
  const [invitedByName, setInvitedByName] = useState<string | null>(null);
  const [childrenCount, setChildrenCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // LGPD/ECA Digital: consentimento explícito de quem está aceitando virar
  // Responsável adicional -- precisa ser marcado ANTES de aceitar (já
  // logado) ou de sair pra /sign-in|/sign-up (senão o aceite automático no
  // retorno, em App.tsx, aconteceria sem nenhum clique explícito de
  // consentimento).
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setStatus('no_token');
      return;
    }
    setToken(t);
    getGuardianInviteInfo(t)
      .then((info) => {
        setInvitedByName(info.invitedByName);
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido.');
      });
  }, []);

  // Aceite (quando já logado) — só dispara com o clique explícito em
  // "Aceitar convite", nunca sozinho: LGPD/ECA Digital exige consentimento
  // explícito, então o checkbox precisa estar marcado antes de chamar isso.
  async function handleAccept() {
    if (!token || !consentChecked || status === 'accepting') return;
    setStatus('accepting');
    setErrorMessage(null);
    try {
      const authToken = await getToken();
      const result = await acceptGuardianInvite(token, authToken);
      setChildrenCount(result.childrenCount);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao confirmar convite.');
    }
  }

  // Quem ainda não tem sessão precisa entrar/criar conta antes de aceitar.
  // Só guarda o token pendente (pro App.tsx confirmar automaticamente no
  // retorno) se o consentimento já foi marcado aqui — assim aquele aceite
  // automático nunca acontece sem um clique explícito de consentimento
  // por parte de quem está aceitando.
  function handleContinueToAuth(event: MouseEvent) {
    if (!token || !consentChecked) {
      // Sem o checkbox marcado, não deixa nem sair pra /sign-in|/sign-up --
      // senão o aceite automático no retorno (App.tsx) rolaria sem nenhum
      // clique explícito de consentimento.
      event.preventDefault();
      return;
    }
    try {
      localStorage.setItem(PENDING_GUARDIAN_INVITE_KEY, token);
    } catch {
      // localStorage pode falhar (modo privado etc.) — segue sem salvar;
      // a pessoa precisa reabrir o mesmo link e marcar o consentimento de
      // novo depois de logar.
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeSwitcher /></div>
      <div className="w-full max-w-md rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 shadow-card">
        {status === 'loading' && (
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">Carregando convite…</p>
        )}

        {status === 'no_token' && (
          <div className="text-center">
            <h1 className="text-xl font-bold">Link incompleto</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Este link não tem um código de convite válido. Peça para quem te convidou enviar um novo.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <h1 className="text-xl font-bold">Não foi possível confirmar</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              O convite pode ter expirado (válido por 7 dias) ou já foi usado. Peça um novo link.
            </p>
            {errorMessage && (
              <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Detalhe técnico: {errorMessage}</p>
            )}
          </div>
        )}

        {(status === 'ready' || status === 'accepting') && (
          <>
            <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
              <Users size={20} />
              <span className="text-xs font-bold uppercase tracking-wide">Convite do Ampara</span>
            </div>
            <h1 className="mt-3 text-xl font-bold">
              {invitedByName ? `${invitedByName} te convidou` : 'Você foi convidado(a)'} pra ser Responsável junto
            </h1>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Ao aceitar, você passa a ver e acompanhar as mesmas crianças deste espaço da família — conversas,
              localização, contatos e tempo de uso.
            </p>

            {status === 'ready' && (
              <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  data-testid="checkbox-guardian-consent"
                />
                Confirmo que sou responsável legal e concordo com o tratamento dos dados das crianças deste
                espaço pelo Ampara Kids, para as finalidades de monitoramento e proteção descritas na Política
                de Privacidade.
              </label>
            )}

            {status === 'accepting' && (
              <p className="mt-4 text-sm font-semibold text-[hsl(var(--primary))]">Confirmando convite…</p>
            )}

            {status === 'ready' && isLoaded && isSignedIn && (
              <button
                type="button"
                onClick={() => { void handleAccept(); }}
                disabled={!consentChecked}
                data-testid="button-guardian-invite-accept"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[hsl(var(--primary))] px-4 font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                Aceitar convite
              </button>
            )}

            {status === 'ready' && !isSignedIn && isLoaded && (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Para aceitar, entre com sua conta ou crie uma nova — você volta pra cá automaticamente.
                </p>
                <Link
                  href="/sign-in"
                  onClick={handleContinueToAuth}
                  data-testid="link-guardian-invite-sign-in"
                  className={`inline-flex min-h-11 items-center justify-center rounded-md bg-[hsl(var(--primary))] px-4 font-semibold text-[hsl(var(--primary-foreground))] ${consentChecked ? '' : 'pointer-events-none opacity-60'}`}
                >
                  Entrar
                </Link>
                <Link
                  href="/sign-up"
                  onClick={handleContinueToAuth}
                  data-testid="link-guardian-invite-sign-up"
                  className={`inline-flex min-h-11 items-center justify-center rounded-md border border-[hsl(var(--border))] px-4 font-semibold ${consentChecked ? '' : 'pointer-events-none opacity-60'}`}
                >
                  Criar conta
                </Link>
              </div>
            )}
          </>
        )}

        {status === 'done' && (
          <div className="text-center">
            <Users size={28} className="mx-auto text-[hsl(var(--primary))]" />
            <h1 className="mt-3 text-xl font-bold">Pronto!</h1>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              {childrenCount === 1
                ? 'Você agora também é Responsável por 1 criança deste espaço.'
                : `Você agora também é Responsável por ${childrenCount ?? 0} crianças deste espaço.`}
            </p>
            <button
              type="button"
              onClick={() => setLocation('/dashboard')}
              data-testid="button-guardian-invite-go-dashboard"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[hsl(var(--primary))] px-5 font-semibold text-[hsl(var(--primary-foreground))]"
            >
              Ir para o painel
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default GuardianJoin;
