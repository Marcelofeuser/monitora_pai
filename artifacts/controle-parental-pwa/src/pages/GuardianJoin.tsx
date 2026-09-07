import { useEffect, useState } from 'react';
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

  // Assim que sabemos se a pessoa já está logada (Clerk carregado) e temos
  // o convite válido, ou aceita na hora (já logada) ou guarda o token pra
  // o AppShell confirmar depois do login/cadastro.
  useEffect(() => {
    if (status !== 'ready' || !isLoaded || !token) return;
    if (!isSignedIn) {
      try {
        localStorage.setItem(PENDING_GUARDIAN_INVITE_KEY, token);
      } catch {
        // localStorage pode falhar (modo privado etc.) — segue sem salvar;
        // a pessoa pode voltar a abrir o mesmo link depois de logar.
      }
      return;
    }
    setStatus('accepting');
    (async () => {
      try {
        const authToken = await getToken();
        // token! -- o guard "if (... || !token) return" acima não estreita
        // o tipo dentro desta função assíncrona aninhada (mesmo padrão já
        // visto em ContactChat.tsx/App.tsx).
        const result = await acceptGuardianInvite(token!, authToken);
        try {
          localStorage.removeItem(PENDING_GUARDIAN_INVITE_KEY);
        } catch {
          // ignora
        }
        setChildrenCount(result.childrenCount);
        setStatus('done');
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro ao confirmar convite.');
      }
    })();
  }, [status, isLoaded, isSignedIn, token, getToken]);

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
            {status === 'accepting' && (
              <p className="mt-4 text-sm font-semibold text-[hsl(var(--primary))]">Confirmando convite…</p>
            )}
            {status === 'ready' && !isSignedIn && isLoaded && (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Para aceitar, entre com sua conta ou crie uma nova — você volta pra cá automaticamente.
                </p>
                <Link
                  href="/sign-in"
                  data-testid="link-guardian-invite-sign-in"
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-[hsl(var(--primary))] px-4 font-semibold text-[hsl(var(--primary-foreground))]"
                >
                  Entrar
                </Link>
                <Link
                  href="/sign-up"
                  data-testid="link-guardian-invite-sign-up"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-[hsl(var(--border))] px-4 font-semibold"
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
