import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  fetchContactConversation,
  sendContactMessage,
} from '@/lib/contact-conversations-api';
import type { PrivateMessage } from '@/lib/contact-conversations-api';
import { ThemeSwitcher } from '@/lib/theme';
import { EmojiPicker } from '@/components/emoji-picker';
import { AttachmentPicker } from '@/components/attachment-picker';
import { StickerPicker } from '@/components/sticker-picker';
import { AudioRecorderButton } from '@/components/audio-recorder-button';
import { MessageContent, isStickerMessage } from '@/components/message-content';
import { LockKeyhole, Plus, Send } from 'lucide-react';

/**
 * Rota /contact — chat contínuo de um Contato aprovado (mãe, avó, tia)
 * com a Criança dele, depois de aceitar o convite em ContactJoin.tsx.
 * Visual adulto/profissional (igual ao chat do Responsável em App.tsx),
 * de propósito diferente do estilo "fofo" que PairingJoin.tsx usa pra
 * criança — quem abre isso é um adulto da família.
 */
const CONTACT_DEVICE_TOKEN_KEY = 'amparo-contact-device-token';
const CONTACT_ID_KEY = 'amparo-contact-user-id';
const CONTACT_NAME_KEY = 'amparo-contact-name';
const CONTACT_CHILD_NAME_KEY = 'amparo-contact-child-name';

const COMPOSER_MAX_HEIGHT = 128;
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
}

export function ContactChat() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [contactUserId, setContactUserId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      setDeviceToken(localStorage.getItem(CONTACT_DEVICE_TOKEN_KEY));
      setContactUserId(localStorage.getItem(CONTACT_ID_KEY));
      setContactName(localStorage.getItem(CONTACT_NAME_KEY));
      setChildName(localStorage.getItem(CONTACT_CHILD_NAME_KEY));
    } catch {
      // localStorage pode falhar (modo privado, etc.).
    }
  }, []);

  useEffect(() => {
    if (!deviceToken) return;
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      try {
        const data = await fetchContactConversation(deviceToken!);
        if (!cancelled) {
          setMessages(data.messages);
          if (data.childName) setChildName(data.childName);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && showSpinner) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        }
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    }

    load(true);
    const intervalId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceToken]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingFile) || !deviceToken || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = pendingFile
        ? await sendContactMessage(deviceToken, { file: pendingFile, caption: text || undefined })
        : await sendContactMessage(deviceToken, { textContent: text });
      setMessages((current) => [...current, message]);
      setDraft('');
      setPendingFile(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function sendSticker(emoji: string) {
    if (!deviceToken || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendContactMessage(deviceToken, { stickerEmoji: emoji });
      setMessages((current) => [...current, message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setSending(false);
    }
  }

  async function sendAudio(file: File) {
    if (!deviceToken || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendContactMessage(deviceToken, { file });
      setMessages((current) => [...current, message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar áudio.');
    } finally {
      setSending(false);
    }
  }

  if (!deviceToken) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8">
        <div className="w-full max-w-md rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 text-center shadow-card">
          <h1 className="text-xl font-bold">Convite não encontrado</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Peça um novo link de convite para o responsável da criança.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[hsl(var(--background))]">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold">{childName ?? 'Conversa'}</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {contactName ? `Conectado como ${contactName}` : 'Contato aprovado'}
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="list-contact-messages">
        {loading && messages.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Nenhuma mensagem ainda com {childName ?? 'a criança'}. Escreva a primeira aqui embaixo.
          </p>
        ) : (
          messages.map((message) => {
            const fromMe = contactUserId !== null && message.senderId === contactUserId;
            const sticker = isStickerMessage(message);
            const bubbleClass = sticker
              ? `${fromMe ? 'self-end' : 'self-start'}`
              : `rounded-2xl px-4 py-2.5 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
            return (
              <div key={message.id} data-testid={`row-contact-message-${message.id}`} className={`max-w-[80%] text-sm leading-6 ${bubbleClass}`}>
                <MessageContent message={message} authHeaders={{ 'X-Contact-Token': deviceToken }} />
                <p className={`mt-1 text-[10px] uppercase tracking-[.08em] ${fromMe && !sticker ? 'text-[hsl(var(--primary-foreground)/.7)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  {new Date(message.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {error && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}
        {attachError && <p className="mb-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{attachError}</p>}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 self-start rounded-xl bg-[hsl(var(--muted)/.6)] px-3 py-2 text-xs font-semibold">
            {pendingFile.type.startsWith('video/') ? 'Vídeo selecionado:' : 'Foto selecionada:'} {pendingFile.name}
            <button type="button" onClick={() => setPendingFile(null)} aria-label="Remover anexo" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              ×
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setComposerToolsOpen((current) => !current)}
              aria-label={composerToolsOpen ? 'Fechar opções' : 'Mais opções (emoji, foto, figurinha, áudio)'}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-transform ${
                composerToolsOpen
                  ? 'rotate-45 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                  : 'border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <Plus size={20} />
            </button>
            {composerToolsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setComposerToolsOpen(false)} />
                <div className="absolute bottom-full left-0 z-40 mb-2 flex flex-col gap-1.5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
                  <EmojiPicker
                    onSelect={(emoji) => {
                      setDraft((current) => current + emoji);
                      setComposerToolsOpen(false);
                    }}
                  />
                  <AttachmentPicker
                    onSelect={(file) => {
                      setAttachError(null);
                      setPendingFile(file);
                      setComposerToolsOpen(false);
                    }}
                    onError={setAttachError}
                  />
                  <StickerPicker
                    onSelect={(emoji) => {
                      void sendSticker(emoji);
                      setComposerToolsOpen(false);
                    }}
                  />
                  <AudioRecorderButton
                    onRecorded={(file) => {
                      void sendAudio(file);
                      setComposerToolsOpen(false);
                    }}
                    onError={setAttachError}
                    disabled={sending}
                  />
                </div>
              </>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              autoGrowTextarea(event.target);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={pendingFile ? 'Adicione uma legenda (opcional)…' : `Escreva pra ${childName ?? 'a criança'}…`}
            rows={1}
            className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.65)] px-4 py-3 text-sm leading-5 outline-none focus:border-[hsl(var(--primary))]"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !pendingFile) || sending}
            aria-label="Enviar mensagem"
            className="grid size-12 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-60"
          >
            {sending ? '…' : <Send size={18} />}
          </button>
        </form>
      </div>
      <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-5 py-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
        <LockKeyhole size={13} className="mr-1 inline-block align-[-2px]" /> Esta conversa também fica visível para o responsável de {childName ?? 'a criança'}.
      </div>
    </main>
  );
}

export default ContactChat;
