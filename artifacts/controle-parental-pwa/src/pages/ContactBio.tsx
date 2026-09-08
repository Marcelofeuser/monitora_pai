import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ShieldCheck } from 'lucide-react';
import { ThemeSwitcher } from '@/lib/theme';
import { BioEditor } from '@/components/bio-editor';
import { fetchContactBio, updateContactBio, uploadContactBioPhoto } from '@/lib/bio-api';
import type { BioProfile, UpdateBioInput } from '@/lib/bio-api';

/**
 * Rota /contact/bio — BIO do Contato (mãe, avó, tia etc). Pedido do
 * Marcelo (08/09, "já pedi pelo menos duas vezes"): "quando qualquer
 * pessoa com convite clicar no convite e entrar, já aparece logo a sua
 * BIO, onde ele adiciona foto, altera o nome e pode colocar mais
 * informações, se quiser, como número de telefone, redes sociais, email".
 *
 * Duas entradas pra esta tela: (1) ContactJoin.tsx manda pra cá logo
 * depois de confirmar o convite (?first=1 -- troca o texto/botão pra
 * "Continuar", já que ainda não existe conversa nenhuma), e (2) o ícone
 * de perfil no header de ContactChat.tsx, pra editar depois quando
 * quiser. Mesmas chaves de localStorage de ContactJoin.tsx/ContactChat.tsx
 * -- o Contato não tem conta Clerk, só o token de dispositivo.
 */
const CONTACT_DEVICE_TOKEN_KEY = 'amparo-contact-device-token';
const CONTACT_NAME_KEY = 'amparo-contact-name';

export function ContactBio() {
  const [, setLocation] = useLocation();
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [bio, setBio] = useState<BioProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no_session' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const isFirstTime = new URLSearchParams(window.location.search).get('first') === '1';

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(CONTACT_DEVICE_TOKEN_KEY);
    } catch {
      token = null;
    }
    if (!token) {
      setStatus('no_session');
      return;
    }
    setDeviceToken(token);
    fetchContactBio(token)
      .then((data) => {
        setBio(data);
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido.');
      });
  }, []);

  async function handleSave(input: UpdateBioInput) {
    if (!deviceToken) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const updated = await updateContactBio(input, deviceToken);
      setBio(updated);
      try {
        if (updated.name) localStorage.setItem(CONTACT_NAME_KEY, updated.name);
      } catch {
        // ignora
      }
      if (isFirstTime) setLocation('/contact');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhoto(file: File) {
    if (!deviceToken) return;
    setUploadingPhoto(true);
    setErrorMessage(null);
    try {
      const { photoUrl } = await uploadContactBioPhoto(file, deviceToken);
      setBio((current) => (current ? { ...current, photoUrl } : current));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao enviar foto.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeSwitcher /></div>
      <div className="w-full max-w-md rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 shadow-card">
        {status === 'loading' && (
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">Carregando…</p>
        )}

        {status === 'no_session' && (
          <div className="text-center">
            <h1 className="text-xl font-bold">Sessão não encontrada</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Abra o link de convite que você recebeu pra entrar de novo.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <h1 className="text-xl font-bold">Não foi possível carregar seu perfil</h1>
            {errorMessage && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Detalhe técnico: {errorMessage}</p>}
          </div>
        )}

        {status === 'ready' && bio && (
          <>
            <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
              <ShieldCheck size={20} />
              <span className="text-xs font-bold uppercase tracking-wide">{isFirstTime ? 'Convite confirmado' : 'Meu perfil'}</span>
            </div>
            <h1 className="mt-3 text-xl font-bold">{isFirstTime ? 'Complete seu perfil' : 'Seu perfil'}</h1>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              {isFirstTime
                ? 'Coloque uma foto e, se quiser, seu telefone e redes sociais. Você pode mudar isso depois quando quiser.'
                : 'Atualize sua foto e informações quando quiser.'}
            </p>
            <div className="mt-5">
              <BioEditor
                photoUrl={bio.photoUrl}
                avatarLabel={bio.name}
                name={bio.name}
                phone={bio.phone}
                email={bio.email}
                socialLinks={bio.socialLinks}
                onUploadPhoto={handlePhoto}
                onSave={handleSave}
                uploadingPhoto={uploadingPhoto}
                saving={saving}
                error={errorMessage}
              />
            </div>
            {isFirstTime && (
              <button
                type="button"
                onClick={() => setLocation('/contact')}
                data-testid="button-skip-bio"
                className="mt-3 w-full text-center text-sm font-medium text-[hsl(var(--muted-foreground))] underline"
              >
                Pular por enquanto
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default ContactBio;
