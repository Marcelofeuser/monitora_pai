import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@clerk/react';
import { createPairing, reconnectPairing } from '@/lib/pairing-api';
import { fetchChildren, deleteChild } from '@/lib/conversations-api';
import type { ChildUser } from '@/lib/conversations-api';

/**
 * Tela do Responsável: cadastra o perfil da Criança e gera o QR code real
 * de pareamento. O QR encoda a `joinUrl` retornada pela API — quando
 * escaneado, abre `/join?token=...` no navegador do aparelho da Criança
 * (ver PairingJoin.tsx), sem depender de telefone/SIM.
 *
 * Pedido do Marcelo: se o aparelho da Criança perder a conexão (limpou
 * dados do navegador, trocou de aparelho), ele quer poder clicar no nome
 * dela — que já existe — e gerar um QR novo pra RECONECTAR, sem criar
 * outro perfil do zero (o que perderia mensagens, localização, tempo de
 * uso etc.). Por isso, se já existe pelo menos uma criança vinculada, essa
 * opção aparece primeiro; "cadastrar uma criança nova" fica como uma opção
 * separada, não a única.
 */
export function PairingGenerate() {
  const { getToken } = useAuth();
  const [children, setChildren] = useState<ChildUser[] | null>(null);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [showNewChildForm, setShowNewChildForm] = useState(false);

  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pairedChildLabel, setPairedChildLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [deletingChildId, setDeletingChildId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((token) => fetchChildren(token))
      .then((data) => {
        if (!cancelled) {
          setChildren(data);
          // Sem nenhuma criança vinculada ainda: pula direto pro formulário
          // de cadastro, não faz sentido mostrar uma lista de reconexão vazia.
          if (data.length === 0) setShowNewChildForm(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setChildrenError(err instanceof Error ? err.message : 'Erro ao carregar crianças.');
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  function buildQr(childLabel: string, result: { joinUrl: string; expiresAt: string }) {
    return QRCode.toDataURL(result.joinUrl, { width: 280, margin: 2 }).then((dataUrl) => {
      setQrDataUrl(dataUrl);
      setJoinUrl(result.joinUrl);
      setExpiresAt(result.expiresAt);
      setPairedChildLabel(childLabel);
    });
  }

  async function handleReconnect(child: ChildUser) {
    if (reconnectingId) return;
    setReconnectingId(child.id);
    setErrorMessage(null);
    try {
      const authToken = await getToken();
      const result = await reconnectPairing(child.id, authToken);
      await buildQr(child.name, result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao gerar o código de reconexão.');
    } finally {
      setReconnectingId(null);
    }
  }

  // Exclusão de verdade da Criança — pedido do Marcelo depois de notar
  // várias crianças duplicadas (sobra de repareamentos de antes da opção
  // de reconectar existir). Irreversível: apaga mensagens, localização e
  // tempo de uso dela junto, por isso o confirm() é bem explícito.
  async function handleDeleteChild(child: ChildUser) {
    if (deletingChildId || reconnectingId) return;
    const ok = window.confirm(
      `Excluir "${child.name}" de verdade? Isso apaga o histórico de conversas, localização e tempo de uso dela. Não dá pra desfazer.`,
    );
    if (!ok) return;
    setDeletingChildId(child.id);
    setErrorMessage(null);
    try {
      const authToken = await getToken();
      await deleteChild(child.id, authToken);
      setChildren((current) => {
        const next = (current ?? []).filter((item) => item.id !== child.id);
        if (next.length === 0) setShowNewChildForm(true);
        return next;
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao excluir a criança.');
    } finally {
      setDeletingChildId(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!childName.trim()) return;

    setStatus('loading');
    setErrorMessage(null);
    try {
      const authToken = await getToken();
      const result = await createPairing(
        { childName: childName.trim(), childAge: childAge.trim() || undefined },
        authToken,
      );
      await buildQr(childName.trim(), result);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido ao gerar o pareamento.');
    }
  }

  function resetToStart() {
    setQrDataUrl(null);
    setJoinUrl(null);
    setExpiresAt(null);
    setPairedChildLabel('');
    setChildName('');
    setChildAge('');
  }

  const minutesLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Vincular dispositivo da criança</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Gere um QR code para a criança escanear com a câmera do aparelho dela. Funciona com
          Wi-Fi, não precisa de chip/SIM.
        </p>
      </div>

      {!qrDataUrl && (
        <>
          {childrenError && (
            <p className="text-sm text-red-500" role="alert">{childrenError}</p>
          )}

          {children && children.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--border))] p-4">
              <div>
                <h2 className="text-sm font-semibold">Reconectar uma criança já vinculada</h2>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Se o aparelho dela perdeu a conexão (limpou os dados do navegador, trocou de
                  celular), clique no nome — o histórico de conversas, localização e tempo de uso
                  continua o mesmo, só o aparelho muda.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {children.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2.5 text-sm font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => { void handleReconnect(child); }}
                      disabled={reconnectingId !== null || deletingChildId !== null}
                      data-testid={`button-reconnect-child-${child.id}`}
                      className="flex flex-1 items-center justify-between text-left transition-colors hover:text-[hsl(var(--primary))] disabled:opacity-60"
                    >
                      {child.name}
                      <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                        {reconnectingId === child.id ? 'Gerando…' : 'Reconectar'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleDeleteChild(child); }}
                      disabled={deletingChildId !== null || reconnectingId !== null}
                      aria-label={`Excluir ${child.name}`}
                      data-testid={`button-delete-child-${child.id}`}
                      className="shrink-0 rounded-full p-1.5 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--destructive))] disabled:opacity-60"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!showNewChildForm ? (
            <button
              type="button"
              onClick={() => setShowNewChildForm(true)}
              className="text-sm font-medium underline"
              data-testid="button-show-new-child-form"
            >
              + Cadastrar uma criança nova
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-[hsl(var(--border))] p-4">
              <h2 className="text-sm font-semibold">Cadastrar uma criança nova</h2>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Nome da criança
                <input
                  className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="Ex: Rafaella"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Idade (opcional)
                <input
                  className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2"
                  value={childAge}
                  onChange={(e) => setChildAge(e.target.value)}
                  placeholder="Ex: 10"
                />
              </label>
              <button
                type="submit"
                disabled={status === 'loading'}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {status === 'loading' ? 'Gerando…' : 'Gerar QR code'}
              </button>
            </form>
          )}

          {errorMessage && (
            <p className="text-sm text-red-500" role="alert">
              {errorMessage}
            </p>
          )}
        </>
      )}

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[hsl(var(--border))] p-6">
          <img src={qrDataUrl} alt={`QR code de pareamento para ${pairedChildLabel}`} width={280} height={280} />
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
            Peça para {pairedChildLabel} abrir a câmera do aparelho dela e apontar para este código.
            {minutesLeft !== null && (
              <>
                {' '}
                Válido por {minutesLeft} min.
              </>
            )}
          </p>
          {joinUrl && (
            <p className="break-all text-center text-xs text-[hsl(var(--muted-foreground))]">
              Ou envie este link diretamente: {joinUrl}
            </p>
          )}
          <button type="button" onClick={resetToStart} className="text-sm font-medium underline">
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}

export default PairingGenerate;
