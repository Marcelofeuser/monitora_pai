import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Camera } from 'lucide-react';
import type { SocialLinks, UpdateBioInput } from '@/lib/bio-api';
import { useAuthedMediaUrl } from '@/lib/media';

/**
 * Formulário de BIO reutilizado nas 3 pontas (pedido do Marcelo, 08/09):
 * Responsável (tela de boas-vindas), Criança (primeira página do app dela)
 * e Contato (logo depois de confirmar o convite). Foto, telefone, e-mail e
 * redes sociais -- tudo opcional, "se quiser" (só nome é obrigatório
 * quando editável). O componente não sabe QUAL das 3 contas está editando
 * -- quem chama passa os dados e as duas funções de salvar (texto / foto).
 */
export function BioEditor({
  photoUrl,
  authHeaders,
  avatarLabel,
  name,
  nameEditable = true,
  phone,
  email,
  socialLinks,
  onUploadPhoto,
  onSave,
  uploadingPhoto = false,
  saving = false,
  error = null,
  kid = false,
}: {
  photoUrl: string | null;
  // GET /api/media/:filename exige autenticação (a mesma que já protege
  // foto/vídeo de mensagem) -- um <img src> puro não manda Authorization
  // nem X-Child-Token/X-Contact-Token, então a foto nunca carregava pra
  // Criança/Contato (bug real relatado em 08/09, na BIO da Mariana). Por
  // isso quem chama BioEditor passa os mesmos headers que já usa pra
  // buscar/salvar a BIO (ver bio-api.ts) -- useAuthedMediaUrl busca o
  // arquivo com esses headers e transforma num object URL (ver lib/media.ts).
  authHeaders: HeadersInit;
  avatarLabel: string;
  name: string;
  nameEditable?: boolean;
  phone: string | null;
  email: string | null;
  socialLinks: SocialLinks | null;
  onUploadPhoto: (file: File) => void | Promise<void>;
  onSave: (input: UpdateBioInput) => void | Promise<void>;
  uploadingPhoto?: boolean;
  saving?: boolean;
  error?: string | null;
  kid?: boolean;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phone ?? '');
  const [draftEmail, setDraftEmail] = useState(email ?? '');
  const [draftInstagram, setDraftInstagram] = useState(socialLinks?.instagram ?? '');
  const [draftWhatsapp, setDraftWhatsapp] = useState(socialLinks?.whatsapp ?? '');
  const [draftOther, setDraftOther] = useState(socialLinks?.other ?? '');
  const { url: resolvedPhotoUrl } = useAuthedMediaUrl(photoUrl, authHeaders);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void onUploadPhoto(file);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (nameEditable && !draftName.trim()) return;
    void onSave({
      ...(nameEditable ? { name: draftName.trim() } : {}),
      phone: draftPhone.trim() || null,
      email: draftEmail.trim() || null,
      socialLinks: {
        instagram: draftInstagram.trim() || undefined,
        whatsapp: draftWhatsapp.trim() || undefined,
        other: draftOther.trim() || undefined,
      },
    });
  }

  const labelClass = kid ? 'font-kid text-sm font-extrabold' : 'text-sm font-bold';
  const inputClass = kid
    ? 'h-12 w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm outline-none focus:border-[hsl(var(--primary))]'
    : 'h-11 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]';

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4 text-left" data-testid="form-bio-editor">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {resolvedPhotoUrl ? (
            <img src={resolvedPhotoUrl} alt="" className="size-16 rounded-full object-cover shadow-sm" data-testid="img-bio-photo" />
          ) : (
            <div
              className="grid size-16 place-items-center rounded-full text-xl font-extrabold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))' }}
              aria-hidden="true"
            >
              {avatarLabel.trim().slice(0, 1).toUpperCase() || '?'}
            </div>
          )}
          <label
            className="absolute -bottom-1 -right-1 grid size-7 cursor-pointer place-items-center rounded-full border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-sm"
            aria-label="Trocar foto"
          >
            <Camera size={13} />
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploadingPhoto} data-testid="input-bio-photo" />
          </label>
        </div>
        <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">
          {uploadingPhoto ? 'Enviando foto…' : 'Toque no ícone da câmera pra colocar ou trocar sua foto.'}
        </p>
      </div>

      {nameEditable && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Seu nome</span>
          <input className={inputClass} value={draftName} onChange={(e) => setDraftName(e.target.value)} required data-testid="input-bio-name" />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Telefone (opcional)</span>
        <input className={inputClass} value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="(DDD) 9 9999-9999" data-testid="input-bio-phone" />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>E-mail (opcional)</span>
        <input type="email" className={inputClass} value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} placeholder="voce@exemplo.com" data-testid="input-bio-email" />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Instagram (opcional)</span>
        <input className={inputClass} value={draftInstagram} onChange={(e) => setDraftInstagram(e.target.value)} placeholder="@seuusuario" data-testid="input-bio-instagram" />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>WhatsApp (opcional)</span>
        <input className={inputClass} value={draftWhatsapp} onChange={(e) => setDraftWhatsapp(e.target.value)} placeholder="(DDD) 9 9999-9999" data-testid="input-bio-whatsapp" />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Outra rede ou link (opcional)</span>
        <input className={inputClass} value={draftOther} onChange={(e) => setDraftOther(e.target.value)} placeholder="Ex: TikTok, site, etc." data-testid="input-bio-other" />
      </label>

      {error && <p className="text-sm font-semibold text-[hsl(var(--destructive))]" data-testid="status-bio-error">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        data-testid="button-save-bio"
        className={
          kid
            ? 'font-kid mt-1 h-12 rounded-full bg-[hsl(var(--primary))] text-sm font-extrabold text-[hsl(var(--primary-foreground))] shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60'
            : 'mt-1 h-11 rounded-md bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-60'
        }
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}

export default BioEditor;
