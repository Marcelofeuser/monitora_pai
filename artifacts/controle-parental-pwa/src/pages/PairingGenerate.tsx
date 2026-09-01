import { useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@clerk/react';
import { createPairing } from '@/lib/pairing-api';

/**
 * Tela do Responsável: cadastra o perfil da Criança e gera o QR code real
 * de pareamento. O QR encoda a `joinUrl` retornada pela API — quando
 * escaneado, abre `/join?token=...` no navegador do aparelho da Criança
 * (ver PairingJoin.tsx), sem depender de telefone/SIM.
 */
export function PairingGenerate() {
  const { getToken } = useAuth();
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const dataUrl = await QRCode.toDataURL(result.joinUrl, { width: 280, margin: 2 });
      setQrDataUrl(dataUrl);
      setJoinUrl(result.joinUrl);
      setExpiresAt(result.expiresAt);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido ao gerar o pareamento.');
    }
  }

  const minutesLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Vincular dispositivo da criança</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Cadastre o perfil e gere um QR code para a criança escanear com a câmera do aparelho
          dela. Funciona com Wi-Fi, não precisa de chip/SIM.
        </p>
      </div>

      {!qrDataUrl && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          {status === 'error' && (
            <p className="text-sm text-red-500" role="alert">
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
          >
            {status === 'loading' ? 'Gerando…' : 'Gerar QR code'}
          </button>
        </form>
      )}

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[hsl(var(--border))] p-6">
          <img src={qrDataUrl} alt={`QR code de pareamento para ${childName}`} width={280} height={280} />
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
            Peça para {childName} abrir a câmera do aparelho dela e apontar para este código.
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
          <button
            type="button"
            onClick={() => {
              setQrDataUrl(null);
              setJoinUrl(null);
              setExpiresAt(null);
              setChildName('');
              setChildAge('');
            }}
            className="text-sm font-medium underline"
          >
            Gerar novo código
          </button>
        </div>
      )}
    </div>
  );
}

export default PairingGenerate;
