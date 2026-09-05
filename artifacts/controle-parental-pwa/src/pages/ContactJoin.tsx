import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation } from 'wouter';
import { getContactInviteInfo, confirmContactInvite } from '@/lib/contact-invite-api';
import { ThemeSwitcher } from '@/lib/theme';
import { ShieldCheck } from 'lucide-react';

/**
 * Rota /join-contact?token=... — pra onde aponta o link/QR gerado pelo
 * Responsável ao convidar um Contato adulto (mãe, avó, tia). Pedido do
 * Marcelo: "a Lorena recebe um link com qrcode, ela basta clicar que já
 * faz o download do app com o pré cadastro dela feito (...) depois se
 * ele quiser pode alterar". Por isso o nome já vem preenchido, mas dá pra
 * editar antes de confirmar.
 *
 * Estilo adulto/profissional (igual ao resto do PWA do Responsável) — de
 * propósito diferente do visual "fofo" de PairingJoin.tsx, que é feito
 * pra criança.
 */
const CONTACT_DEVICE_TOKEN_KEY = 'amparo-contact-device-token';
const CONTACT_ID_KEY = 'amparo-contact-user-id';
const CONTACT_NAME_KEY = 'amparo-contact-name';
const CONTACT_CHILD_NAME_KEY = 'amparo-contact-child-name';

export function ContactJoin() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'ready' | 'confirming' | 'error' | 'no_token'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [childName, setChildName] = useState('');
  const [contactName, setContactName] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setStatus('no_token');
      return;
    }
    setToken(t);
    getContactInviteInfo(t)
      .then((info) => {
        setChildName(info.childName);
        setContactName(info.contactName);
        setExpiresAt(info.expiresAt);
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido.');
      });
  }, []);

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    if (!token || !contactName.trim()) return;
    setStatus('confirming');
    setErrorMessage(null);
    try {
      const result = await confirmContactInvite(token, contactName.trim());
      try {
        localStorage.setItem(CONTACT_DEVICE_TOKEN_KEY, result.deviceToken);
        localStorage.setItem(CONTACT_ID_KEY, result.contactUserId);
        localStorage.setItem(CONTACT_NAME_KEY, result.contactName);
        localStorage.setItem(CONTACT_CHILD_NAME_KEY, result.childName);
      } catch {
        // localStorage pode falhar (modo privado, etc.) — não bloqueia o fluxo.
      }
      setLocation('/contact');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao confirmar convite.');
    }
  }

  const minutesLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : null;

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

        {(status === 'ready' || status === 'confirming') && (
          <>
            <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
              <ShieldCheck size={20} />
              <span className="text-xs font-bold uppercase tracking-wide">Convite do Amparo</span>
            </div>
            <h1 className="mt-3 text-xl font-bold">
              Você foi convidado(a) a conversar com {childName}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Confirme (ou ajuste) seu nome abaixo pra concluir. Depois disso você poderá conversar com{' '}
              {childName} por aqui — a conversa também fica visível para o responsável dela.
              {minutesLeft !== null && <> Convite válido por mais {minutesLeft} min.</>}
            </p>
            <form onSubmit={handleConfirm} className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Seu nome
                <input
                  className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ex: Tia Lorena"
                  required
                  data-testid="input-contact-name"
                />
              </label>
              <button
                type="submit"
                disabled={status === 'confirming' || !contactName.trim()}
                data-testid="button-confirm-contact-invite"
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {status === 'confirming' ? 'Confirmando…' : 'Confirmar e começar a conversar'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default ContactJoin;
