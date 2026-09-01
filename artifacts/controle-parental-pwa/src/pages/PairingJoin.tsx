import { useEffect, useState } from 'react';
import { confirmPairing } from '@/lib/pairing-api';
import { reportLocation } from '@/lib/location-api';

/**
 * Rota /join?token=... — é para onde o link do QR code aponta.
 * Esta é a tela que estava faltando: antes não existia NENHUMA rota que
 * recebesse o token escaneado, por isso o QR "não aprovava nada".
 */

// Chave usada para guardar a credencial do aparelho da Criança. Ela não tem
// conta Clerk — este token é o que autentica o envio de localização
// (ver lib/location-api.ts / middlewares/childAuth.ts no backend).
const DEVICE_TOKEN_KEY = 'amparo-child-device-token';

export function PairingJoin() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error' | 'no_token'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'asking' | 'shared' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('no_token');
      return;
    }

    confirmPairing(token)
      .then((result) => {
        setChildName(result.childName);
        setDeviceToken(result.deviceToken);
        try {
          localStorage.setItem(DEVICE_TOKEN_KEY, result.deviceToken);
        } catch {
          // localStorage pode falhar (modo privado, etc.) — não bloqueia o fluxo.
        }
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido.');
      });
  }, []);

  function shareLocation() {
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      setShareStatus('error');
      setShareError('Não foi possível encontrar a credencial deste aparelho.');
      return;
    }
    if (!('geolocation' in navigator)) {
      setShareStatus('error');
      setShareError('Este navegador não suporta localização.');
      return;
    }
    setShareStatus('asking');
    setShareError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reportLocation(token, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        })
          .then(() => setShareStatus('shared'))
          .catch((err) => {
            setShareStatus('error');
            setShareError(err instanceof Error ? err.message : 'Erro desconhecido.');
          });
      },
      (err) => {
        setShareStatus('error');
        setShareError(
          err.code === err.PERMISSION_DENIED
            ? 'Permissão de localização negada.'
            : 'Não foi possível obter a localização.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      {status === 'checking' && <p>Confirmando vínculo com o Responsável…</p>}

      {status === 'no_token' && (
        <>
          <h1 className="text-lg font-bold">Link incompleto</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Este link não tem um código de pareamento válido. Peça para o Responsável gerar um
            novo QR code.
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-lg font-bold">Não foi possível vincular</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            O código pode ter expirado (válido por 15 minutos) ou já foi usado. Peça para o
            Responsável gerar um novo QR code.
          </p>
          {errorMessage && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Detalhe técnico: {errorMessage}</p>
          )}
        </>
      )}

      {status === 'success' && (
        <>
          <h1 className="text-lg font-bold">Tudo pronto, {childName}!</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Seu aparelho já está vinculado ao Responsável. Você já pode usar o app normalmente.
          </p>

          <div className="mt-4 w-full rounded-lg border border-[hsl(var(--border))] p-4 text-left">
            <h2 className="text-base font-semibold">Compartilhar minha localização</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Só acontece quando você escolhe — sem rastreamento em segundo plano. Toque no botão
              sempre que quiser que o Responsável veja onde você está agora.
            </p>
            <button
              type="button"
              onClick={shareLocation}
              disabled={shareStatus === 'asking'}
              className="mt-3 w-full rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
            >
              {shareStatus === 'asking'
                ? 'Pedindo permissão…'
                : shareStatus === 'shared'
                  ? 'Compartilhado! Compartilhar de novo'
                  : 'Compartilhar minha localização agora'}
            </button>
            {shareStatus === 'shared' && (
              <p className="mt-2 text-sm text-green-600">Localização enviada com sucesso.</p>
            )}
            {shareStatus === 'error' && shareError && (
              <p className="mt-2 text-sm text-red-600">{shareError}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default PairingJoin;
