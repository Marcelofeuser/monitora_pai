import { useEffect, useState } from 'react';
import { confirmPairing } from '@/lib/pairing-api';

/**
 * Rota /join?token=... — é para onde o link do QR code aponta.
 * Esta é a tela que estava faltando: antes não existia NENHUMA rota que
 * recebesse o token escaneado, por isso o QR "não aprovava nada".
 */
export function PairingJoin() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error' | 'no_token'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);

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
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido.');
      });
  }, []);

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
        </>
      )}
    </div>
  );
}

export default PairingJoin;
